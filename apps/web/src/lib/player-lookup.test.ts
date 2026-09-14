import {
  createDb,
  latestSnapshots,
  playerCareerStats,
  servers,
  type Database,
} from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { snapshotFixture } from "./live-snapshot-fixture";
import { getPlayerCareerStat, searchPlayersByName } from "./player-lookup";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = "http://player-lookup.test:9006";

afterEach(async () => {
  await db.delete(playerCareerStats);
  await db.delete(latestSnapshots);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

describe("searchPlayersByName", () => {
  it("returns an empty list when the Server isn't seeded", async () => {
    const result = await searchPlayersByName(db, BASE_URL, "alice");

    expect(result).toEqual([]);
  });

  it("finds players by case-insensitive partial name match, most kills first", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(playerCareerStats).values([
      {
        serverId: server.id,
        steamId: "1",
        displayName: "Alice Anderson",
        kills: 5,
        deaths: 1,
        cash: 100,
        matchesPlayed: 1,
      },
      {
        serverId: server.id,
        steamId: "2",
        displayName: "alicia",
        kills: 20,
        deaths: 1,
        cash: 100,
        matchesPlayed: 1,
      },
      {
        serverId: server.id,
        steamId: "3",
        displayName: "Bob",
        kills: 999,
        deaths: 1,
        cash: 100,
        matchesPlayed: 1,
      },
    ]);

    const result = await searchPlayersByName(db, BASE_URL, "ali");

    expect(result.map((row) => row.displayName)).toEqual([
      "alicia",
      "Alice Anderson",
    ]);
  });
});

describe("getPlayerCareerStat", () => {
  it("returns null when the Server isn't seeded", async () => {
    const result = await getPlayerCareerStat(db, BASE_URL, "1");

    expect(result).toBeNull();
  });

  it("returns null when the player has no PlayerCareerStat row", async () => {
    await db.insert(servers).values({ name: "WDZA Test", baseUrl: BASE_URL });

    const result = await getPlayerCareerStat(db, BASE_URL, "1");

    expect(result).toBeNull();
  });

  it("returns the player's all-time totals by steamId", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(playerCareerStats).values({
      serverId: server.id,
      steamId: "1",
      displayName: "Alice",
      kills: 30,
      deaths: 6,
      cash: 2500,
      matchesPlayed: 4,
    });

    const result = await getPlayerCareerStat(db, BASE_URL, "1");

    expect(result).toEqual({
      steamId: "1",
      displayName: "Alice",
      kills: 30,
      deaths: 6,
      kd: 5,
      cash: 2500,
      matchesPlayed: 4,
      factionColor: null,
      avatarUrl: null,
      playtimeMinutes: null,
    });
  });

  it("colors the player's Faction when they're currently online", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(playerCareerStats).values({
      serverId: server.id,
      steamId: "1",
      displayName: "Alice",
      kills: 10,
      deaths: 2,
      cash: 100,
      matchesPlayed: 1,
    });

    await db.insert(latestSnapshots).values({
      serverId: server.id,
      capturedAt: new Date("2026-01-01T00:00:00.000Z"),
      payload: snapshotFixture({
        factions: [{ name: "Valkyra", color: "#0000ff", score: 10 }],
        players: [
          {
            steamId: "1",
            displayName: "Alice",
            faction: "Valkyra",
            kills: 10,
            deaths: 2,
            cash: 100,
            ping: 20,
          },
        ],
      }),
    });

    const result = await getPlayerCareerStat(db, BASE_URL, "1");

    expect(result?.factionColor).toBe("#0000ff");
  });
});
