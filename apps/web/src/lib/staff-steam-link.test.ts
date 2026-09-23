import { staffAuditLog, staffMembers } from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { createStaffMember } from "./staff";
import { getOwnSteamId, getStaffSteamIds, linkOwnSteamId, unlinkOwnSteamId } from "./staff-steam-link";

const STEAM_ID = "76561198000000001";

afterEach(async () => {
  await db.delete(staffAuditLog);
  await db.delete(staffMembers);
});

afterAll(async () => {
  await db.$client.end();
});

async function staff(email: string) {
  const user = await createStaffMember({ email, name: email, password: "correct horse battery", role: "moderator" });
  return { id: user.id, email };
}

describe("linkOwnSteamId", () => {
  it("links the steamId to the acting Staff Member and records it", async () => {
    const alice = await staff("alice@example.test");

    await expect(linkOwnSteamId(db, alice, STEAM_ID)).resolves.toEqual({ ok: true });

    await expect(getOwnSteamId(db, alice.id)).resolves.toBe(STEAM_ID);
    const log = await db.select().from(staffAuditLog);
    expect(log).toEqual([expect.objectContaining({ action: "link_own_steam_id", target: STEAM_ID, staffMemberId: alice.id })]);
  });

  it("refuses a steamId already linked to another Staff Member", async () => {
    const alice = await staff("alice@example.test");
    const bob = await staff("bob@example.test");
    await linkOwnSteamId(db, alice, STEAM_ID);

    const result = await linkOwnSteamId(db, bob, STEAM_ID);

    expect(result).toEqual({ ok: false, error: expect.stringContaining("another Staff Member") });
    await expect(getOwnSteamId(db, bob.id)).resolves.toBeNull();
    await expect(getOwnSteamId(db, alice.id)).resolves.toBe(STEAM_ID);
  });

  it("treats re-linking your own steamId as done, without a second audit entry", async () => {
    const alice = await staff("alice@example.test");
    await linkOwnSteamId(db, alice, STEAM_ID);

    await expect(linkOwnSteamId(db, alice, STEAM_ID)).resolves.toEqual({ ok: true });

    await expect(db.select().from(staffAuditLog)).resolves.toHaveLength(1);
  });
});

describe("unlinkOwnSteamId", () => {
  it("removes the link and records it, and does nothing when there's no link", async () => {
    const alice = await staff("alice@example.test");
    await unlinkOwnSteamId(db, alice);
    await expect(db.select().from(staffAuditLog)).resolves.toEqual([]);

    await linkOwnSteamId(db, alice, STEAM_ID);
    await unlinkOwnSteamId(db, alice);

    await expect(getOwnSteamId(db, alice.id)).resolves.toBeNull();
    const actions = (await db.select().from(staffAuditLog)).map((row) => row.action);
    expect(actions).toEqual(["link_own_steam_id", "unlink_own_steam_id"]);
  });
});

describe("getStaffSteamIds", () => {
  it("returns only the given steamIds that a Staff Member has linked", async () => {
    const alice = await staff("alice@example.test");
    await linkOwnSteamId(db, alice, STEAM_ID);

    const result = await getStaffSteamIds(db, [STEAM_ID, "76561198000000002"]);

    expect([...result]).toEqual([STEAM_ID]);
  });
});
