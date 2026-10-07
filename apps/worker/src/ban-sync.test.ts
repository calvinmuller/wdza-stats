import { bannedPlayers, createDb, type Database } from "@wdza-stats/db";
import { asc } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { syncWarconBans } from "./ban-sync";
import type { WarconBanEntry, WarconClient } from "./warcon-client";

const db: Database = createDb(process.env.DATABASE_URL!);

afterEach(async () => {
  await db.delete(bannedPlayers);
});

afterAll(async () => {
  await db.$client.end();
});

function ban(steamId: string, overrides: Partial<WarconBanEntry> = {}): WarconBanEntry {
  return {
    steamId,
    name: `Player ${steamId}`,
    reason: "",
    expiresAt: null,
    expired: false,
    addedAt: "2026-10-07T09:00:00.000Z",
    removedAt: null,
    ...overrides,
  };
}

function warcon(bans: WarconBanEntry[]): WarconClient {
  return { fetchBans: async () => bans };
}

function rows() {
  return db.select().from(bannedPlayers).orderBy(asc(bannedPlayers.steamId));
}

describe("syncWarconBans", () => {
  it("stores each Warcon ban with its reason and the time it was added, and no reason when Warcon's is blank", async () => {
    await syncWarconBans(
      db,
      warcon([
        ban("1", { reason: "Cheating", addedAt: "2026-10-07T13:18:24.378Z" }),
        ban("2", { reason: "  " }),
      ]),
    );

    expect(await rows()).toEqual([
      { steamId: "1", reason: "Cheating", bannedAt: new Date("2026-10-07T13:18:24.378Z"), source: "warcon" },
      { steamId: "2", reason: null, bannedAt: new Date("2026-10-07T09:00:00.000Z"), source: "warcon" },
    ]);
  });

  it("deletes a Warcon ban once Warcon stops listing it", async () => {
    await syncWarconBans(db, warcon([ban("1"), ban("2")]));
    await syncWarconBans(db, warcon([ban("2")]));

    expect((await rows()).map((row) => row.steamId)).toEqual(["2"]);

    await syncWarconBans(db, warcon([]));

    expect(await rows()).toEqual([]);
  });

  it("updates a Warcon ban's reason when it changes in Warcon", async () => {
    await syncWarconBans(db, warcon([ban("1")]));
    await syncWarconBans(db, warcon([ban("1", { reason: "Griefing" })]));

    expect(await rows()).toMatchObject([{ steamId: "1", reason: "Griefing", source: "warcon" }]);
  });

  it("never changes or deletes a site ban, even for a steamId Warcon also bans", async () => {
    const bannedAt = new Date("2026-01-01T00:00:00.000Z");
    await db.insert(bannedPlayers).values([
      { steamId: "1", reason: "Moderator ban", bannedAt },
      { steamId: "2", reason: "Another moderator ban", bannedAt },
    ]);

    await syncWarconBans(db, warcon([ban("1", { reason: "From Warcon" })]));
    await syncWarconBans(db, warcon([]));

    expect(await rows()).toEqual([
      { steamId: "1", reason: "Moderator ban", bannedAt, source: "site" },
      { steamId: "2", reason: "Another moderator ban", bannedAt, source: "site" },
    ]);
  });

  it("throws and keeps the last synced list when Warcon can't be read", async () => {
    await syncWarconBans(db, warcon([ban("1")]));
    const failing: WarconClient = { fetchBans: () => Promise.reject(new Error("network error")) };

    await expect(syncWarconBans(db, failing)).rejects.toThrow("network error");
    expect((await rows()).map((row) => row.steamId)).toEqual(["1"]);
  });
});
