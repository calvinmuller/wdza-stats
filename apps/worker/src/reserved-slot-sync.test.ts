import { createDb, reservedSlots, type Database } from "@wdza-stats/db";
import { asc } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { syncWarconReservedSlots } from "./reserved-slot-sync";
import type { WarconClient, WarconListEntry } from "./warcon-client";

const db: Database = createDb(process.env.DATABASE_URL!);

afterEach(async () => {
  await db.delete(reservedSlots);
});

afterAll(async () => {
  await db.$client.end();
});

function slot(steamId: string, overrides: Partial<WarconListEntry> = {}): WarconListEntry {
  return {
    steamId,
    name: `Player ${steamId}`,
    reason: "Donor",
    expiresAt: null,
    expired: false,
    addedAt: "2026-10-07T09:00:00.000Z",
    removedAt: null,
    ...overrides,
  };
}

function warcon(slots: WarconListEntry[]): WarconClient {
  return { fetchBans: async () => [], fetchReservedSlots: async () => slots };
}

function rows() {
  return db.select().from(reservedSlots).orderBy(asc(reservedSlots.steamId));
}

describe("syncWarconReservedSlots", () => {
  it("stores each reserved slot with its name and the time it was added, but never its reason", async () => {
    await syncWarconReservedSlots(
      db,
      warcon([slot("1", { addedAt: "2026-10-07T13:18:24.378Z" }), slot("2", { name: null })]),
    );

    expect(await rows()).toEqual([
      { steamId: "1", name: "Player 1", addedAt: new Date("2026-10-07T13:18:24.378Z") },
      { steamId: "2", name: null, addedAt: new Date("2026-10-07T09:00:00.000Z") },
    ]);
  });

  it("drops a reserved slot once Warcon stops listing it", async () => {
    await syncWarconReservedSlots(db, warcon([slot("1"), slot("2")]));
    await syncWarconReservedSlots(db, warcon([slot("2")]));

    expect((await rows()).map((row) => row.steamId)).toEqual(["2"]);

    await syncWarconReservedSlots(db, warcon([]));

    expect(await rows()).toEqual([]);
  });

  it("keeps one row for a steamId Warcon lists twice", async () => {
    await syncWarconReservedSlots(db, warcon([slot("1", { name: "First" }), slot("1", { name: "Second" })]));

    expect(await rows()).toMatchObject([{ steamId: "1", name: "First" }]);
  });

  it("throws and keeps the last synced list when Warcon can't be read", async () => {
    await syncWarconReservedSlots(db, warcon([slot("1")]));
    const failing: WarconClient = {
      fetchBans: async () => [],
      fetchReservedSlots: () => Promise.reject(new Error("network error")),
    };

    await expect(syncWarconReservedSlots(db, failing)).rejects.toThrow("network error");
    expect((await rows()).map((row) => row.steamId)).toEqual(["1"]);
  });
});
