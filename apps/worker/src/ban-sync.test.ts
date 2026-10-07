import { bannedPlayers, createDb, type Database } from "@wdza-stats/db";
import { asc } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { syncServerBans } from "./ban-sync";
import type { RawBansResponse, RconClient } from "./rcon-client";
import { playersFixture, statusFixture } from "./rcon-fixture";

const db: Database = createDb(process.env.DATABASE_URL!);

afterEach(async () => {
  await db.delete(bannedPlayers);
});

afterAll(async () => {
  await db.$client.end();
});

function bansClient(bans: RawBansResponse["bans"]): RconClient {
  return {
    fetchStatus: async () => statusFixture(),
    fetchPlayers: async () => playersFixture(),
    fetchRotation: async () => ({ entries: [] }),
    fetchBans: async () => ({ bans, count: bans.length }),
    kickPlayer: async () => {},
    broadcast: async () => {},
  };
}

function rows() {
  return db.select().from(bannedPlayers).orderBy(asc(bannedPlayers.steamId));
}

describe("syncServerBans", () => {
  it("stores each game server ban as a server ban, keeping a real ban date and dating config bans when first seen", async () => {
    const before = new Date();

    await syncServerBans(
      db,
      bansClient([
        { steamId: "1", bannedAtUtc: "2026-03-01T12:00:00.000Z", bannedBy: "admin", reason: "Aimbot" },
        { steamId: "2", bannedAtUtc: "0001-01-01T00:00:00.000Z", bannedBy: "config", reason: null },
      ]),
    );

    const [first, second] = await rows();
    expect(first).toEqual({
      steamId: "1",
      reason: "Aimbot",
      bannedAt: new Date("2026-03-01T12:00:00.000Z"),
      source: "server",
    });
    expect(second).toMatchObject({ steamId: "2", reason: null, source: "server" });
    expect(second.bannedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
  });

  it("deletes a server ban once the game server lifts it", async () => {
    await syncServerBans(
      db,
      bansClient([
        { steamId: "1", bannedAtUtc: "0001-01-01T00:00:00.000Z", bannedBy: "config", reason: null },
        { steamId: "2", bannedAtUtc: "0001-01-01T00:00:00.000Z", bannedBy: "config", reason: null },
      ]),
    );
    await syncServerBans(
      db,
      bansClient([{ steamId: "2", bannedAtUtc: "0001-01-01T00:00:00.000Z", bannedBy: "config", reason: null }]),
    );

    expect((await rows()).map((row) => row.steamId)).toEqual(["2"]);

    await syncServerBans(db, bansClient([]));

    expect(await rows()).toEqual([]);
  });

  it("updates a server ban's reason without moving its ban date", async () => {
    await syncServerBans(
      db,
      bansClient([{ steamId: "1", bannedAtUtc: "0001-01-01T00:00:00.000Z", bannedBy: "config", reason: null }]),
    );
    const [original] = await rows();

    await syncServerBans(
      db,
      bansClient([{ steamId: "1", bannedAtUtc: "0001-01-01T00:00:00.000Z", bannedBy: "config", reason: "Griefing" }]),
    );

    expect(await rows()).toEqual([{ ...original, reason: "Griefing" }]);
  });

  it("never changes or deletes a site ban, even for a steamId the game server also bans", async () => {
    const bannedAt = new Date("2026-01-01T00:00:00.000Z");
    await db.insert(bannedPlayers).values([
      { steamId: "1", reason: "Moderator ban", bannedAt },
      { steamId: "2", reason: "Another moderator ban", bannedAt },
    ]);

    await syncServerBans(
      db,
      bansClient([{ steamId: "1", bannedAtUtc: "2026-03-01T00:00:00.000Z", bannedBy: "admin", reason: "In-game" }]),
    );
    await syncServerBans(db, bansClient([]));

    expect(await rows()).toEqual([
      { steamId: "1", reason: "Moderator ban", bannedAt, source: "site" },
      { steamId: "2", reason: "Another moderator ban", bannedAt, source: "site" },
    ]);
  });

  it("throws and keeps the last synced list when RCON can't be read", async () => {
    await syncServerBans(
      db,
      bansClient([{ steamId: "1", bannedAtUtc: "0001-01-01T00:00:00.000Z", bannedBy: "config", reason: null }]),
    );
    const failing: RconClient = {
      ...bansClient([]),
      fetchBans: () => Promise.reject(new Error("network error")),
    };

    await expect(syncServerBans(db, failing)).rejects.toThrow("network error");
    expect((await rows()).map((row) => row.steamId)).toEqual(["1"]);
  });
});
