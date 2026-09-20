import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { staffMembers, type StaffRole } from "@wdza-stats/db";
import { auth } from "./auth";
import { db } from "./db";
import { createStaffMember } from "./staff";

// requireStaff* read the request's cookies through next/headers; in a test
// there is no request, so each test sets the headers it wants to "arrive" with.
let requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));

const { getCurrentStaff, hasRole, requireStaffAction, requireStaffPage } = await import(
  "./require-staff"
);

const PASSWORD = "correct horse battery";

beforeEach(async () => {
  requestHeaders = new Headers();
  await db.delete(staffMembers);
});

afterAll(async () => {
  await db.delete(staffMembers);
  await db.$client.end();
});

async function signInAs(role: StaffRole) {
  const email = `${role}@example.test`;
  await createStaffMember({ email, name: role, password: PASSWORD, role });
  const { headers } = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  requestHeaders = new Headers({ cookie });
}

describe("signing in", () => {
  it("accepts the right password and starts a session cookie", async () => {
    await createStaffMember({ email: "a@example.test", name: "A", password: PASSWORD, role: "admin" });

    const { headers, response } = await auth.api.signInEmail({
      body: { email: "a@example.test", password: PASSWORD },
      returnHeaders: true,
    });

    expect(response.user.email).toBe("a@example.test");
    const setCookie = headers.getSetCookie().join("\n");
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  it("rejects a wrong password and an unknown email", async () => {
    await createStaffMember({ email: "a@example.test", name: "A", password: PASSWORD, role: "admin" });

    await expect(
      auth.api.signInEmail({ body: { email: "a@example.test", password: "wrong password" } }),
    ).rejects.toThrow();
    await expect(
      auth.api.signInEmail({ body: { email: "nobody@example.test", password: PASSWORD } }),
    ).rejects.toThrow();
  });

  it("treats email case-insensitively", async () => {
    await createStaffMember({ email: "Mixed@Example.test", name: "M", password: PASSWORD, role: "admin" });

    const { response } = await auth.api.signInEmail({
      body: { email: "mixed@example.test", password: PASSWORD },
      returnHeaders: true,
    });

    expect(response.user.email).toBe("mixed@example.test");
  });
});

describe("anonymous sign-up", () => {
  it("is refused over HTTP and creates no Staff Member", async () => {
    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ email: "intruder@example.test", password: PASSWORD, name: "Intruder" }),
      }),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await db.select().from(staffMembers)).toHaveLength(0);
  });

  it("is refused through the server API too", async () => {
    await expect(
      auth.api.signUpEmail({ body: { email: "intruder@example.test", password: PASSWORD, name: "Intruder" } }),
    ).rejects.toThrow();
    expect(await db.select().from(staffMembers)).toHaveLength(0);
  });
});

describe("requireStaff", () => {
  it("hasRole ranks admin above moderator", () => {
    const staff = (role: StaffRole) => ({ id: "1", email: "e", name: "n", role, mustChangePassword: false });

    expect(hasRole(staff("admin"), "moderator")).toBe(true);
    expect(hasRole(staff("admin"), "admin")).toBe(true);
    expect(hasRole(staff("moderator"), "moderator")).toBe(true);
    expect(hasRole(staff("moderator"), "admin")).toBe(false);
    expect(hasRole(null, "moderator")).toBe(false);
  });

  it("finds nobody for an anonymous request", async () => {
    expect(await getCurrentStaff()).toBeNull();
  });

  it("finds a signed-in Staff Member with their Role", async () => {
    await signInAs("moderator");

    expect(await getCurrentStaff()).toMatchObject({ email: "moderator@example.test", role: "moderator" });
  });

  it("lets a moderator through a moderator check but not an admin check", async () => {
    await signInAs("moderator");

    await expect(requireStaffAction("moderator")).resolves.toMatchObject({ role: "moderator" });
    await expect(requireStaffAction("admin")).rejects.toThrow("Forbidden");
    await expect(requireStaffPage("admin")).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
  });

  it("lets an admin through both checks", async () => {
    await signInAs("admin");

    await expect(requireStaffAction("admin")).resolves.toMatchObject({ role: "admin" });
    await expect(requireStaffAction("moderator")).resolves.toMatchObject({ role: "admin" });
    await expect(requireStaffPage("admin")).resolves.toMatchObject({ role: "admin" });
  });

  it("refuses an anonymous request: sign-in redirect for pages, an error for actions", async () => {
    await expect(requireStaffAction("moderator")).rejects.toThrow("Forbidden");
    await expect(requireStaffPage("moderator")).rejects.toThrow(/NEXT_REDIRECT/);
  });
});
