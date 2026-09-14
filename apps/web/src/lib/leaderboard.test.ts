import {
  createDb,
  latestSnapshots,
  playerCareerStats,
  servers,
  type Database,
} from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { getLeaderboard } from "./leaderboard";
import { snapshotFixture } from "./live-snapshot-fixture";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = "http://leaderboard.test:9006";

afterEach(async () => {
  await db.delete(playerCareerStats);
  await db.delete(latestSnapshots);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

describe("getLeaderboard", () => {
  it("returns an empty list when the Server isn't seeded", async () => {
    const result = await getLeaderboard(db, BASE_URL, "kills");

    expect(result).toEqual([]);
  });

  it("returns an empty list when the Server has no PlayerCareerStat rows", async () => {
    await db.insert(servers).values({ name: "WDZA Test", baseUrl: BASE_URL });

    const result = await getLeaderboard(db, BASE_URL, "kills");

    expect(result).toEqual([]);
  });

  it("ranks players by the requested sort, highest first", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(playerCareerStats).values([
      {
        serverId: server.id,
        steamId: "1",
        displayName: "Alice",
        kills: 50,
        deaths: 10,
        cash: 100,
        matchesPlayed: 3,
      },
      {
        serverId: server.id,
        steamId: "2",
        displayName: "Bob",
        kills: 20,
        deaths: 2,
        cash: 500,
        matchesPlayed: 1,
      },
      {
        serverId: server.id,
        steamId: "3",
        displayName: "Carol",
        kills: 5,
        deaths: 0,
        cash: 20,
        matchesPlayed: 2,
      },
    ]);

    const byKills = await getLeaderboard(db, BASE_URL, "kills");
    expect(byKills.map((row) => row.displayName)).toEqual([
      "Alice",
      "Bob",
      "Carol",
    ]);

    const byCash = await getLeaderboard(db, BASE_URL, "cash");
    expect(byCash.map((row) => row.displayName)).toEqual([
      "Bob",
      "Alice",
      "Carol",
    ]);

    const byKd = await getLeaderboard(db, BASE_URL, "kd");
    // Raw K/D: Carol 5/0 -> 5, Bob 20/2 -> 10, Alice 50/10 -> 5, all shrunk
    // toward the server average (weighted by matches played), so Carol's
    // one game pulls further toward average than Alice's three.
    // avgKd = 75/12 = 6.25
    // Alice: (3*5 + 10*6.25) / 13 ~= 5.96
    // Bob: (1*10 + 10*6.25) / 11 ~= 6.59
    // Carol: (2*5 + 10*6.25) / 12 ~= 6.04
    expect(byKd.map((row) => row.displayName)).toEqual([
      "Bob",
      "Carol",
      "Alice",
    ]);
  });

  it("shrinks a small-sample K/D toward the server average more than a well-established one", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(playerCareerStats).values([
      // A handful of typical players establishing a stable server-average
      // K/D of around 3, so the shrinkage below has a real baseline to
      // pull toward instead of being dominated by the two outliers.
      ...["Dave", "Erin", "Frank"].map((displayName, index) => ({
        serverId: server.id,
        steamId: `avg-${index}`,
        displayName,
        kills: 30,
        deaths: 10,
        cash: 0,
        matchesPlayed: 10,
      })),
      {
        // One game, perfect record - raw K/D of 9 shouldn't outrank a
        // long, consistently strong record.
        serverId: server.id,
        steamId: "1",
        displayName: "OneHitWonder",
        kills: 9,
        deaths: 0,
        cash: 0,
        matchesPlayed: 1,
      },
      {
        // Twenty games at K/D 7 - a proven, reliable record.
        serverId: server.id,
        steamId: "2",
        displayName: "Veteran",
        kills: 140,
        deaths: 20,
        cash: 0,
        matchesPlayed: 20,
      },
    ]);

    const byKd = await getLeaderboard(db, BASE_URL, "kd");

    expect(
      byKd
        .map((row) => row.displayName)
        .filter((name) => name === "Veteran" || name === "OneHitWonder"),
    ).toEqual(["Veteran", "OneHitWonder"]);
  });

  it("includes cash, deaths, K/D and matches played in each row", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(playerCareerStats).values({
      serverId: server.id,
      steamId: "1",
      displayName: "Alice",
      kills: 10,
      deaths: 4,
      cash: 1500,
      matchesPlayed: 3,
    });

    const [row] = await getLeaderboard(db, BASE_URL, "kills");

    expect(row).toEqual({
      steamId: "1",
      displayName: "Alice",
      kills: 10,
      deaths: 4,
      kd: 2.5,
      adjustedKd: 2.5,
      cash: 1500,
      matchesPlayed: 3,
      factionColor: null,
      avatarUrl: null,
    });
  });

  it("scopes the leaderboard to the requested Server only", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();
    const [otherServer] = await db
      .insert(servers)
      .values({ name: "Other Server", baseUrl: "http://other.test:9006" })
      .returning();

    await db.insert(playerCareerStats).values([
      {
        serverId: server.id,
        steamId: "1",
        displayName: "Alice",
        kills: 10,
        deaths: 0,
        cash: 0,
        matchesPlayed: 1,
      },
      {
        serverId: otherServer.id,
        steamId: "2",
        displayName: "Bob",
        kills: 999,
        deaths: 0,
        cash: 0,
        matchesPlayed: 1,
      },
    ]);

    const result = await getLeaderboard(db, BASE_URL, "kills");

    expect(result.map((row) => row.displayName)).toEqual(["Alice"]);
  });

  it("colors a row using the player's Faction in the latest Snapshot when they're online", async () => {
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
        factions: [{ name: "Lonestar", color: "#ff0000", score: 10 }],
        players: [
          {
            steamId: "1",
            displayName: "Alice",
            faction: "Lonestar",
            kills: 10,
            deaths: 2,
            cash: 100,
            ping: 20,
          },
        ],
      }),
    });

    const [row] = await getLeaderboard(db, BASE_URL, "kills");

    expect(row.factionColor).toBe("#ff0000");
  });
});
