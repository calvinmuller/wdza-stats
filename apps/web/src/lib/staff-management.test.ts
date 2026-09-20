import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, staffMembers, staffSessions, type Database } from "@wdza-stats/db";
import { auth } from "./auth";
import { createStaffMember } from "./staff";
import {
  addStaffMember,
  changeOwnPassword,
  changeStaffRole,
  listStaffMembers,
  removeStaffMember,
  setTemporaryPassword,
} from "./staff-management";

const db: Database = createDb(process.env.DATABASE_URL!);
const PASSWORD = "correct horse battery";

beforeEach(async () => {
  await db.delete(staffMembers);
});

afterAll(async () => {
  await db.delete(staffMembers);
  await db.$client.end();
});

const signIn = (email: string, password: string) =>
  auth.api.signInEmail({ body: { email, password }, returnHeaders: true });

async function member(email: string, role: "admin" | "moderator", extra: { mustChangePassword?: boolean } = {}) {
  return createStaffMember({ email, name: email, password: PASSWORD, role, ...extra });
}

const roleOf = async (id: string) =>
  (await db.select({ role: staffMembers.role }).from(staffMembers).where(eq(staffMembers.id, id)))[0]?.role;

describe("addStaffMember", () => {
  it("creates a Staff Member whose temporary password must be changed", async () => {
    const result = await addStaffMember(db, {
      email: "New@Example.test",
      name: "New",
      role: "moderator",
      temporaryPassword: "temp password 1",
    });

    expect(result).toEqual({ ok: true });
    const [row] = await listStaffMembers(db);
    expect(row).toMatchObject({ email: "new@example.test", role: "moderator", mustChangePassword: true });
    const { response } = await signIn("new@example.test", "temp password 1");
    expect(response.user).toMatchObject({ role: "moderator", mustChangePassword: true });
  });

  it("rejects a bad email, a short password, a duplicate email and an unknown Role", async () => {
    await member("taken@example.test", "moderator");
    const base = { name: "N", role: "moderator" as const, temporaryPassword: "temp password 1" };

    expect(await addStaffMember(db, { ...base, email: "nope" })).toMatchObject({ ok: false });
    expect(await addStaffMember(db, { ...base, email: "a@example.test", temporaryPassword: "short" })).toMatchObject({ ok: false });
    expect(await addStaffMember(db, { ...base, email: "TAKEN@example.test" })).toMatchObject({ ok: false });
    expect(await addStaffMember(db, { ...base, email: "b@example.test", role: "owner" as never })).toMatchObject({ ok: false });
    expect(await db.select().from(staffMembers)).toHaveLength(1);
  });
});

describe("changeStaffRole", () => {
  it("promotes a moderator and demotes an admin when another admin remains", async () => {
    const a = await member("a@example.test", "admin");
    const m = await member("m@example.test", "moderator");

    expect(await changeStaffRole(db, m.id, "admin")).toEqual({ ok: true });
    expect(await roleOf(m.id)).toBe("admin");
    expect(await changeStaffRole(db, a.id, "moderator")).toEqual({ ok: true });
    expect(await roleOf(a.id)).toBe("moderator");
  });

  it("refuses to demote the last admin", async () => {
    const a = await member("a@example.test", "admin");
    await member("m@example.test", "moderator");

    expect(await changeStaffRole(db, a.id, "moderator")).toMatchObject({ ok: false });
    expect(await roleOf(a.id)).toBe("admin");
  });

  it("never leaves the site without an admin when two admins are demoted at once", async () => {
    // A race, so repeat it: without the row lock in changeStaffRole this ends
    // with zero admins on nearly every run.
    for (let i = 0; i < 15; i++) {
      await db.delete(staffMembers);
      const a = await member("a@example.test", "admin");
      const b = await member("b@example.test", "admin");

      const results = await Promise.all([changeStaffRole(db, a.id, "moderator"), changeStaffRole(db, b.id, "moderator")]);

      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(await db.select().from(staffMembers).where(eq(staffMembers.role, "admin"))).toHaveLength(1);
    }
  });

  it("rejects an unknown Role and a vanished Staff Member", async () => {
    const a = await member("a@example.test", "admin");

    expect(await changeStaffRole(db, a.id, "owner" as never)).toMatchObject({ ok: false });
    expect(await changeStaffRole(db, "no-such-id", "moderator")).toMatchObject({ ok: false });
  });
});

describe("removeStaffMember", () => {
  it("removes a moderator, and an admin when another admin remains, with their sessions", async () => {
    const a = await member("a@example.test", "admin");
    const b = await member("b@example.test", "admin");
    const m = await member("m@example.test", "moderator");
    await signIn("b@example.test", PASSWORD);

    expect(await removeStaffMember(db, m.id)).toEqual({ ok: true });
    expect(await removeStaffMember(db, b.id)).toEqual({ ok: true });

    expect((await listStaffMembers(db)).map((s) => s.id)).toEqual([a.id]);
    expect(await db.select().from(staffSessions)).toHaveLength(0);
    await expect(signIn("b@example.test", PASSWORD)).rejects.toThrow();
  });

  it("refuses to remove the last admin", async () => {
    const a = await member("a@example.test", "admin");
    await member("m@example.test", "moderator");

    expect(await removeStaffMember(db, a.id)).toMatchObject({ ok: false });
    expect(await roleOf(a.id)).toBe("admin");
  });
});

describe("setTemporaryPassword", () => {
  it("replaces the password, forces a change, and signs them out everywhere", async () => {
    const m = await member("m@example.test", "moderator");
    await signIn("m@example.test", PASSWORD);

    expect(await setTemporaryPassword(db, m.id, "temp password 2")).toEqual({ ok: true });

    await expect(signIn("m@example.test", PASSWORD)).rejects.toThrow();
    const { response } = await signIn("m@example.test", "temp password 2");
    expect(response.user).toMatchObject({ mustChangePassword: true });
    expect(await db.select().from(staffSessions).where(eq(staffSessions.staffMemberId, m.id))).toHaveLength(1);
  });

  it("rejects a short password and an unknown Staff Member", async () => {
    const m = await member("m@example.test", "moderator");

    expect(await setTemporaryPassword(db, m.id, "short")).toMatchObject({ ok: false });
    expect(await setTemporaryPassword(db, "no-such-id", "temp password 2")).toMatchObject({ ok: false });
    await expect(signIn("m@example.test", PASSWORD)).resolves.toBeDefined();
  });
});

describe("changeOwnPassword", () => {
  async function signedIn(email: string, password: string) {
    const { headers, response } = await signIn(email, password);
    const cookie = headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    return { headers: new Headers({ cookie }), id: response.user.id };
  }

  it("clears the must-change flag and makes the new password work", async () => {
    const m = await member("m@example.test", "moderator");
    await setTemporaryPassword(db, m.id, "temp password 2");
    const { headers, id } = await signedIn("m@example.test", "temp password 2");

    const result = await changeOwnPassword(db, {
      headers,
      staffMemberId: id,
      currentPassword: "temp password 2",
      newPassword: "my own password",
    });

    expect(result).toEqual({ ok: true });
    const { response } = await signIn("m@example.test", "my own password");
    expect(response.user).toMatchObject({ mustChangePassword: false });
    await expect(signIn("m@example.test", "temp password 2")).rejects.toThrow();
  });

  it("refuses a wrong current password, a short or unchanged new one, and keeps the flag", async () => {
    const m = await member("m@example.test", "moderator", { mustChangePassword: true });
    const { headers, id } = await signedIn("m@example.test", PASSWORD);
    const base = { headers, staffMemberId: id };

    expect(await changeOwnPassword(db, { ...base, currentPassword: "wrong wrong", newPassword: "my own password" })).toMatchObject({ ok: false });
    expect(await changeOwnPassword(db, { ...base, currentPassword: PASSWORD, newPassword: "short" })).toMatchObject({ ok: false });
    expect(await changeOwnPassword(db, { ...base, currentPassword: PASSWORD, newPassword: PASSWORD })).toMatchObject({ ok: false });
    const [row] = await db.select().from(staffMembers).where(eq(staffMembers.id, m.id));
    expect(row.mustChangePassword).toBe(true);
  });
});
