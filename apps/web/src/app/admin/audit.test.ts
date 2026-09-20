import { desc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { bannedPlayers, staffAuditLog, staffMembers, xpRewards, type StaffRole } from "@wdza-stats/db";
import { ADMIN_PATH_SECRET } from "@/lib/admin-secret";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createStaffMember } from "@/lib/staff";

let requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const actions = await import("./actions");
const staffActions = await import("./staff/actions");
const changePasswordActions = await import("./change-password/actions");
const bootstrapActions = await import("../[adminSecret]/bootstrap/actions");

const PASSWORD = "correct horse battery";
const STEAM_ID = "76561198000000999";

beforeEach(async () => {
  requestHeaders = new Headers();
  await db.delete(staffMembers);
  await db.delete(staffAuditLog);
  await db.delete(bannedPlayers).where(eq(bannedPlayers.steamId, STEAM_ID));
});

afterAll(async () => {
  await db.delete(staffMembers);
  await db.delete(staffAuditLog);
  await db.delete(bannedPlayers).where(eq(bannedPlayers.steamId, STEAM_ID));
  await db.$client.end();
});

async function signInAs(role: StaffRole, mustChangePassword = false) {
  const email = `${role}@example.test`;
  const created = await createStaffMember({ email, name: role, password: PASSWORD, role, mustChangePassword });
  const { headers } = await auth.api.signInEmail({ body: { email, password: PASSWORD }, returnHeaders: true });
  requestHeaders = new Headers({ cookie: headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") });
  return created;
}

function form(fields: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

// The actions that end in redirect() throw NEXT_REDIRECT on success.
async function succeeds(call: () => Promise<unknown>) {
  await expect(call()).rejects.toThrow(/NEXT_REDIRECT/);
}

const entries = () => db.select().from(staffAuditLog).orderBy(desc(staffAuditLog.id));

describe("ban and unban", () => {
  it("record which moderator banned a player, and why, and who lifted it", async () => {
    const mod = await signInAs("moderator");

    await succeeds(() => actions.banPlayerAction(form({ steamId: STEAM_ID, reason: "cheating" })));
    await succeeds(() => actions.unbanPlayerAction(STEAM_ID));

    const [unban, ban] = await entries();
    expect(ban).toMatchObject({
      staffMemberId: mod.id,
      actorEmail: "moderator@example.test",
      action: "ban_player",
      target: STEAM_ID,
      detail: { reason: "cheating" },
    });
    expect(unban).toMatchObject({ staffMemberId: mod.id, action: "unban_player", target: STEAM_ID });
  });

  it("record nothing when the action failed", async () => {
    await signInAs("moderator");

    await expect(actions.banPlayerAction(form())).rejects.not.toThrow(/NEXT_REDIRECT/);

    expect(await entries()).toHaveLength(0);
  });

  it("record nothing when the caller was refused", async () => {
    await expect(actions.banPlayerAction(form({ steamId: STEAM_ID }))).rejects.toThrow("Forbidden");

    expect(await entries()).toHaveLength(0);
  });
});

describe("config edits", () => {
  it("record the admin and the values they submitted", async () => {
    const admin = await signInAs("admin");
    const [reward] = await db.select().from(xpRewards).where(eq(xpRewards.reason, "kill"));

    // Resubmit the current value so the shared config is left untouched.
    await succeeds(() => actions.updateXpRewardAction("kill", form({ amount: String(reward.amount) })));

    const [entry] = await entries();
    expect(entry).toMatchObject({
      staffMemberId: admin.id,
      action: "update_xp_reward",
      target: "kill",
      detail: { amount: String(reward.amount) },
    });
  });
});

describe("staff management", () => {
  it("records adds, role changes, resets and removals against the acting admin", async () => {
    const admin = await signInAs("admin");

    await staffActions.addStaffMemberAction(null, form({ email: "New@Example.test", name: "N", role: "moderator", temporaryPassword: "temp password 1" }));
    const added = (await db.select().from(staffMembers)).find((s) => s.email === "new@example.test")!;
    await staffActions.changeStaffRoleAction(added.id, null, form({ role: "admin" }));
    await staffActions.resetStaffPasswordAction(added.id, null, form({ temporaryPassword: "temp password 2" }));
    await staffActions.removeStaffMemberAction(added.id, null, form());

    const log = (await entries()).reverse();
    expect(log.map((e) => e.action)).toEqual(["add_staff_member", "change_staff_role", "reset_staff_password", "remove_staff_member"]);
    expect(log.every((e) => e.staffMemberId === admin.id && e.actorEmail === "admin@example.test")).toBe(true);
    expect(log[0]).toMatchObject({ target: "new@example.test", detail: { role: "moderator" } });
    expect(log[1]).toMatchObject({ target: added.id, detail: { role: "admin" } });
    expect(log[3]).toMatchObject({ target: added.id, detail: { email: "new@example.test" } });
  });

  it("never records a password", async () => {
    await signInAs("admin");
    await staffActions.addStaffMemberAction(null, form({ email: "n@example.test", name: "N", role: "moderator", temporaryPassword: "temp password 1" }));
    const id = (await db.select().from(staffMembers)).find((s) => s.email === "n@example.test")!.id;
    await staffActions.resetStaffPasswordAction(id, null, form({ temporaryPassword: "temp password 2" }));

    const dump = JSON.stringify(await entries());

    expect(dump).not.toContain("temp password");
    expect(dump).not.toContain(PASSWORD);
  });

  it("records nothing for a refused change, such as demoting the last admin", async () => {
    const admin = await signInAs("admin");

    const result = await staffActions.changeStaffRoleAction(admin.id, null, form({ role: "moderator" }));

    expect(result).toMatchObject({ ok: false });
    expect(await entries()).toHaveLength(0);
  });

  it("keeps an entry after its actor is removed", async () => {
    await signInAs("admin");
    const mod = await createStaffMember({ email: "m@example.test", name: "M", password: PASSWORD, role: "moderator" });
    await db.insert(staffAuditLog).values({ staffMemberId: mod.id, actorEmail: "m@example.test", action: "ban_player", target: STEAM_ID });

    await staffActions.removeStaffMemberAction(mod.id, null, form());

    expect((await entries()).find((e) => e.action === "ban_player")).toMatchObject({ actorEmail: "m@example.test" });
  });

  it("records a Staff Member changing their own password", async () => {
    const me = await signInAs("moderator", true);

    await expect(
      changePasswordActions.changePasswordAction(null, form({ currentPassword: PASSWORD, newPassword: "my own password" })),
    ).rejects.toThrow(/NEXT_REDIRECT/);

    expect((await entries())[0]).toMatchObject({ staffMemberId: me.id, action: "change_own_password" });
  });
});

describe("the bootstrap page", () => {
  it("records that the bootstrap page created or reset an admin, with no actor", async () => {
    await bootstrapActions.createFirstAdminAction(ADMIN_PATH_SECRET, null, form({ email: "Boss@Example.test", name: "Boss", password: "long enough password" }));
    await bootstrapActions.resetAdminPasswordAction(ADMIN_PATH_SECRET, null, form({ email: "boss@example.test", password: "another long password" }));

    const [reset, create] = await entries();
    expect(create).toMatchObject({ staffMemberId: null, actorEmail: "(bootstrap page)", action: "bootstrap_create_admin", target: "boss@example.test" });
    expect(reset).toMatchObject({ staffMemberId: null, action: "bootstrap_reset_admin_password", target: "boss@example.test" });
    expect(JSON.stringify([reset, create])).not.toContain("long enough password");
  });
});
