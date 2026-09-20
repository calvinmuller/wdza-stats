import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, staffMembers, staffSessions, type Database } from "@wdza-stats/db";
import { auth } from "./auth";
import { adminExists, createFirstAdmin, resetAdminPassword } from "./staff-bootstrap";
import { createStaffMember } from "./staff";

const db: Database = createDb(process.env.DATABASE_URL!);

beforeEach(async () => {
  await db.delete(staffMembers);
});

afterAll(async () => {
  await db.delete(staffMembers);
  await db.$client.end();
});

const signIn = (email: string, password: string) => auth.api.signInEmail({ body: { email, password } });

describe("createFirstAdmin", () => {
  it("creates an admin who can then sign in", async () => {
    const result = await createFirstAdmin(db, { email: "Boss@Example.test", name: "Boss", password: "correct horse" });

    expect(result).toEqual({ ok: true });
    expect(await adminExists(db)).toBe(true);
    const { user } = await signIn("boss@example.test", "correct horse");
    expect(user).toMatchObject({ email: "boss@example.test", role: "admin" });
  });

  it("refuses once an admin exists, and creates nothing", async () => {
    await createStaffMember({ email: "a@example.test", name: "A", password: "correct horse", role: "admin" });

    const result = await createFirstAdmin(db, { email: "b@example.test", name: "B", password: "correct horse" });

    expect(result).toMatchObject({ ok: false });
    expect(await db.select().from(staffMembers)).toHaveLength(1);
  });

  it("still allows it when only moderators exist", async () => {
    await createStaffMember({ email: "m@example.test", name: "M", password: "correct horse", role: "moderator" });

    expect(await createFirstAdmin(db, { email: "a@example.test", name: "A", password: "correct horse" })).toEqual({ ok: true });
  });

  it("rejects a short password, a bad email, and a taken email", async () => {
    expect(await createFirstAdmin(db, { email: "a@example.test", name: "A", password: "short" })).toMatchObject({ ok: false });
    expect(await createFirstAdmin(db, { email: "not-an-email", name: "A", password: "correct horse" })).toMatchObject({ ok: false });
    await createStaffMember({ email: "m@example.test", name: "M", password: "correct horse", role: "moderator" });
    expect(await createFirstAdmin(db, { email: "M@example.test", name: "A", password: "correct horse" })).toMatchObject({ ok: false });
    expect(await adminExists(db)).toBe(false);
  });
});

describe("resetAdminPassword", () => {
  it("replaces the admin's password and signs them out everywhere", async () => {
    const admin = await createStaffMember({ email: "a@example.test", name: "A", password: "old password", role: "admin" });
    await signIn("a@example.test", "old password");
    expect(await db.select().from(staffSessions).where(eq(staffSessions.staffMemberId, admin.id))).toHaveLength(1);

    const result = await resetAdminPassword(db, { email: "A@example.test", password: "new password" });

    expect(result).toEqual({ ok: true });
    await expect(signIn("a@example.test", "old password")).rejects.toThrow();
    await expect(signIn("a@example.test", "new password")).resolves.toBeDefined();
    expect(await db.select().from(staffSessions).where(eq(staffSessions.staffMemberId, admin.id))).toHaveLength(1);
  });

  it("does not reach moderators or unknown emails", async () => {
    await createStaffMember({ email: "m@example.test", name: "M", password: "old password", role: "moderator" });

    expect(await resetAdminPassword(db, { email: "m@example.test", password: "new password" })).toMatchObject({ ok: false });
    expect(await resetAdminPassword(db, { email: "nobody@example.test", password: "new password" })).toMatchObject({ ok: false });
    await expect(signIn("m@example.test", "old password")).resolves.toBeDefined();
  });

  it("rejects a too-short new password and leaves the old one working", async () => {
    await createStaffMember({ email: "a@example.test", name: "A", password: "old password", role: "admin" });

    expect(await resetAdminPassword(db, { email: "a@example.test", password: "short" })).toMatchObject({ ok: false });
    await expect(signIn("a@example.test", "old password")).resolves.toBeDefined();
  });
});
