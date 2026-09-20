import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Database } from "./client";
import { staffCredentials, staffMembers, staffSessions } from "./schema";

const db: Database = createDb(process.env.DATABASE_URL!);

beforeEach(async () => {
  await db.delete(staffMembers);
});

afterAll(async () => {
  await db.delete(staffMembers);
  await db.$client.end();
});

const member = (overrides: Partial<typeof staffMembers.$inferInsert> = {}) => ({
  id: "staff-1",
  name: "Alex",
  email: "alex@example.test",
  role: "admin" as const,
  ...overrides,
});

describe("staff tables", () => {
  it("stores a Staff Member with a Role", async () => {
    await db.insert(staffMembers).values(member({ role: "moderator" }));

    const [row] = await db.select().from(staffMembers);

    expect(row).toMatchObject({ email: "alex@example.test", role: "moderator", emailVerified: false });
  });

  it("rejects a Role that is not moderator or admin", async () => {
    await expect(
      db.insert(staffMembers).values(member({ role: "owner" as never })),
    ).rejects.toThrow();
  });

  it("rejects a second Staff Member with the same email", async () => {
    await db.insert(staffMembers).values(member());

    await expect(db.insert(staffMembers).values(member({ id: "staff-2" }))).rejects.toThrow();
  });

  it("removes a Staff Member's sessions and credentials with them", async () => {
    await db.insert(staffMembers).values(member());
    await db.insert(staffCredentials).values({
      id: "cred-1",
      staffMemberId: "staff-1",
      accountId: "staff-1",
      providerId: "credential",
      password: "hash",
    });
    await db.insert(staffSessions).values({
      id: "sess-1",
      staffMemberId: "staff-1",
      token: "tok",
      expiresAt: new Date(Date.now() + 60_000),
    });

    await db.delete(staffMembers);

    expect(await db.select().from(staffCredentials)).toHaveLength(0);
    expect(await db.select().from(staffSessions)).toHaveLength(0);
  });
});
