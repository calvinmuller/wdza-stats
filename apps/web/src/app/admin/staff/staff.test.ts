import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { staffMembers, type StaffRole } from "@wdza-stats/db";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createStaffMember } from "@/lib/staff";

let requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({}),
}));

const actions = await import("./actions");
const changePasswordActions = await import("../change-password/actions");
const { default: StaffPage } = await import("./page");
const { default: ChangePasswordPage } = await import("../change-password/page");
const { default: AdminPage } = await import("../page");

const PASSWORD = "correct horse battery";
const NOT_FOUND = /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/;

beforeEach(async () => {
  requestHeaders = new Headers();
  await db.delete(staffMembers);
});

afterAll(async () => {
  await db.delete(staffMembers);
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

const staffCount = async () => (await db.select().from(staffMembers)).length;

describe("staff actions", () => {
  const calls: Array<[string, () => Promise<unknown>]> = [
    ["addStaffMemberAction", () => actions.addStaffMemberAction(null, form({ email: "x@example.test", name: "X", role: "admin", temporaryPassword: "temp password 1" }))],
    ["changeStaffRoleAction", () => actions.changeStaffRoleAction("some-id", null, form({ role: "admin" }))],
    ["resetStaffPasswordAction", () => actions.resetStaffPasswordAction("some-id", null, form({ temporaryPassword: "temp password 1" }))],
    ["removeStaffMemberAction", () => actions.removeStaffMemberAction("some-id", null, form())],
  ];

  it.each(calls)("%s refuses an anonymous caller and a moderator", async (_name, call) => {
    await expect(call()).rejects.toThrow("Forbidden");
    await signInAs("moderator");
    await expect(call()).rejects.toThrow("Forbidden");
    expect(await staffCount()).toBe(1);
  });

  it.each(calls)("%s refuses an admin who still has to change their password", async (_name, call) => {
    await signInAs("admin", true);

    await expect(call()).rejects.toThrow("Password change required");
  });

  it("let an admin add, re-role, reset and remove a Staff Member", async () => {
    await signInAs("admin");

    expect(await actions.addStaffMemberAction(null, form({ email: "m@example.test", name: "M", role: "moderator", temporaryPassword: "temp password 1" }))).toEqual({ ok: true });
    const id = (await db.select().from(staffMembers)).find((s) => s.email === "m@example.test")!.id;
    expect(await actions.changeStaffRoleAction(id, null, form({ role: "admin" }))).toEqual({ ok: true });
    expect(await actions.resetStaffPasswordAction(id, null, form({ temporaryPassword: "temp password 2" }))).toEqual({ ok: true });
    expect(await actions.removeStaffMemberAction(id, null, form())).toEqual({ ok: true });
    expect(await staffCount()).toBe(1);
  });

  it("stop an admin removing or demoting themselves when they are the last admin", async () => {
    const me = await signInAs("admin");

    expect(await actions.removeStaffMemberAction(me.id, null, form())).toMatchObject({ ok: false });
    expect(await actions.changeStaffRoleAction(me.id, null, form({ role: "moderator" }))).toMatchObject({ ok: false });
    expect(await staffCount()).toBe(1);
  });
});

describe("the forced password change", () => {
  it("sends a Staff Member who must change it from any admin page to the change-password page", async () => {
    await signInAs("admin", true);

    await expect(AdminPage()).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(StaffPage()).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("lets them change it, which frees them", async () => {
    await signInAs("admin", true);

    await expect(
      changePasswordActions.changePasswordAction(null, form({ currentPassword: PASSWORD, newPassword: "my own password" })),
    ).rejects.toThrow(/NEXT_REDIRECT/);

    const [row] = await db.select().from(staffMembers);
    expect(row.mustChangePassword).toBe(false);
  });

  it("refuses the change with a wrong current password and stays blocked", async () => {
    await signInAs("admin", true);

    const result = await changePasswordActions.changePasswordAction(null, form({ currentPassword: "not it at all", newPassword: "my own password" }));

    expect(result).toMatchObject({ ok: false });
    expect((await db.select().from(staffMembers))[0].mustChangePassword).toBe(true);
  });

  it("is refused to an anonymous caller", async () => {
    await expect(changePasswordActions.changePasswordAction(null, form({ currentPassword: "x", newPassword: "yyyyyyyy" }))).rejects.toThrow("Forbidden");
    await expect(ChangePasswordPage()).rejects.toThrow(NOT_FOUND);
  });
});

describe("pages", () => {
  it("StaffPage lists Staff Members for an admin", async () => {
    await signInAs("admin");
    await createStaffMember({ email: "other@example.test", name: "Other", password: PASSWORD, role: "moderator" });

    const html = renderToStaticMarkup(await StaffPage());

    expect(html).toContain("Add a Staff Member");
    expect(html).toContain("other@example.test");
    expect(html).toContain("(you)");
  });

  it("StaffPage 404s for an anonymous visitor and for a moderator", async () => {
    await expect(StaffPage()).rejects.toThrow(NOT_FOUND);
    await signInAs("moderator");
    await expect(StaffPage()).rejects.toThrow(NOT_FOUND);
  });

  it("ChangePasswordPage explains itself to someone whose password an admin set", async () => {
    await signInAs("moderator", true);

    expect(renderToStaticMarkup(await ChangePasswordPage())).toContain("An admin set your current password");
  });

  it("the admin page links to Staff for an admin but not for a moderator", async () => {
    await signInAs("admin");
    expect(renderToStaticMarkup(await AdminPage())).toContain('href="/admin/staff"');

    await db.delete(staffMembers);
    await signInAs("moderator");
    expect(renderToStaticMarkup(await AdminPage())).not.toContain('href="/admin/staff"');
  });
});
