import {
  createDb,
  currentSeason,
  latestSnapshots,
  matches,
  playerCareerStats,
  playerSeasonStats,
  seasons,
  servers,
  type Database,
} from "@wdza-stats/db";
import { gt } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { snapshotFixture } from "./live-snapshot-fixture";
import { getServerStats } from "./server-stats";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = "http://server-stats.test:9006";

// Season 1 comes from the migration; tests add Seasons above it.
let baseline: number;

beforeAll(async () => {
  baseline = (await currentSeason(db)).number;
});

afterEach(async () => {
  await db.delete(playerSeasonStats);
  await db.delete(playerCareerStats);
  await db.delete(matches);
  await db.delete(seasons).where(gt(seasons.number, baseline));
  await db.delete(latestSnapshots);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

describe("getServerStats", () => {
  it("returns all-zero stats when the Server isn't seeded", async () => {
    const result = await getServerStats(db, BASE_URL);

    expect(result).toEqual({
      totalMatches: 0,
      totalKills: 0,
      totalDeaths: 0,
      uniquePlayers: 0,
      factionWins: [],
    });
  });

  it("sums kills/deaths and counts unique players from PlayerCareerStat", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(playerCareerStats).values([
      {
        serverId: server.id,
        steamId: "1",
        displayName: "Alice",
        kills: 10,
        deaths: 4,
        cash: 0,
        matchesPlayed: 1,
      },
      {
        serverId: server.id,
        steamId: "2",
        displayName: "Bob",
        kills: 6,
        deaths: 2,
        cash: 0,
        matchesPlayed: 1,
      },
    ]);

    const result = await getServerStats(db, BASE_URL);

    expect(result.totalKills).toBe(16);
    expect(result.totalDeaths).toBe(6);
    expect(result.uniquePlayers).toBe(2);
  });

  it("counts only closed Matches toward totalMatches", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(matches).values([
      {
        serverId: server.id,
        map: "Foundry",
        experiences: ["Frontline"],
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        endedAt: new Date("2026-01-01T00:30:00.000Z"),
        winningFaction: "Lonestar",
      },
      {
        serverId: server.id,
        map: "Open Map",
        experiences: ["Frontline"],
        startedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    ]);

    const result = await getServerStats(db, BASE_URL);

    expect(result.totalMatches).toBe(1);
  });

  it("ranks Factions by closed-Match wins, most first, coloring from the latest Snapshot", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(matches).values([
      {
        serverId: server.id,
        map: "Foundry",
        experiences: ["Frontline"],
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        endedAt: new Date("2026-01-01T00:30:00.000Z"),
        winningFaction: "Lonestar",
      },
      {
        serverId: server.id,
        map: "Sandstorm",
        experiences: ["Frontline"],
        startedAt: new Date("2026-01-02T00:00:00.000Z"),
        endedAt: new Date("2026-01-02T00:30:00.000Z"),
        winningFaction: "Lonestar",
      },
      {
        serverId: server.id,
        map: "Deadcity",
        experiences: ["Frontline"],
        startedAt: new Date("2026-01-03T00:00:00.000Z"),
        endedAt: new Date("2026-01-03T00:30:00.000Z"),
        winningFaction: "Valkyra",
      },
      {
        serverId: server.id,
        map: "Pre-column",
        experiences: ["Frontline"],
        startedAt: new Date("2026-01-04T00:00:00.000Z"),
        endedAt: new Date("2026-01-04T00:30:00.000Z"),
        winningFaction: null,
      },
    ]);

    await db.insert(latestSnapshots).values({
      serverId: server.id,
      capturedAt: new Date("2026-01-05T00:00:00.000Z"),
      payload: snapshotFixture({
        factions: [
          { name: "Lonestar", color: "#ff0000", score: 10 },
          { name: "Valkyra", color: "#0000ff", score: 8 },
        ],
      }),
    });

    const result = await getServerStats(db, BASE_URL);

    expect(result.totalMatches).toBe(4);
    expect(result.factionWins).toEqual([
      { faction: "Lonestar", color: "#ff0000", wins: 2 },
      { faction: "Valkyra", color: "#0000ff", wins: 1 },
    ]);
  });

  it("scopes stats to the requested Server only", async () => {
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

    const result = await getServerStats(db, BASE_URL);

    expect(result.totalKills).toBe(10);
    expect(result.uniquePlayers).toBe(1);
  });

  describe("for a Season", () => {
    it("counts only that Season's Matches and PlayerSeasonStats, and the Seasons sum to Career", async () => {
      const [server] = await db
        .insert(servers)
        .values({ name: "WDZA Test", baseUrl: BASE_URL })
        .returning();
      const past = await currentSeason(db);
      const [current] = await db.insert(seasons).values({ number: baseline + 1 }).returning();

      const match = (seasonId: number, winningFaction: string | null, closed = true) => ({
        serverId: server.id,
        seasonId,
        map: "Foundry",
        experiences: ["Frontline"],
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        endedAt: closed ? new Date("2026-01-01T00:30:00.000Z") : null,
        winningFaction,
      });
      await db.insert(matches).values([
        match(past.id, "Lonestar"),
        match(past.id, "Lonestar"),
        match(past.id, "Valkyra"),
        match(current.id, "Valkyra"),
        // Still open: counts toward no Season's Matches yet.
        match(current.id, null, false),
      ]);

      // Career is the sum over both Seasons.
      await db.insert(playerCareerStats).values([
        { serverId: server.id, steamId: "1", displayName: "Alice", kills: 13, deaths: 6, matchesPlayed: 4 },
        { serverId: server.id, steamId: "2", displayName: "Bob", kills: 5, deaths: 9, matchesPlayed: 3 },
        { serverId: server.id, steamId: "3", displayName: "Carol", xp: 20, highestKillStreak: 2 },
      ]);
      await db.insert(playerSeasonStats).values([
        { seasonId: past.id, serverId: server.id, steamId: "1", kills: 10, deaths: 4, matchesPlayed: 3 },
        { seasonId: past.id, serverId: server.id, steamId: "2", kills: 5, deaths: 9, matchesPlayed: 3 },
        { seasonId: current.id, serverId: server.id, steamId: "1", kills: 3, deaths: 2, matchesPlayed: 1 },
        // Carol's only play is in the still-open Match: XP and a streak so
        // far, but no Match played - kills only arrive when a Match closes.
        { seasonId: current.id, serverId: server.id, steamId: "3", xp: 20, highestKillStreak: 2 },
      ]);

      const lastSeason = await getServerStats(db, BASE_URL, { kind: "season", season: past });
      const thisSeason = await getServerStats(db, BASE_URL, { kind: "season", season: current });
      const career = await getServerStats(db, BASE_URL, { kind: "career" });

      expect(lastSeason).toMatchObject({ totalMatches: 3, totalKills: 15, totalDeaths: 13, uniquePlayers: 2 });
      expect(lastSeason.factionWins.map(({ faction, wins }) => [faction, wins])).toEqual([
        ["Lonestar", 2],
        ["Valkyra", 1],
      ]);
      expect(thisSeason).toMatchObject({ totalMatches: 1, totalKills: 3, totalDeaths: 2, uniquePlayers: 1 });
      expect(thisSeason.factionWins.map(({ faction, wins }) => [faction, wins])).toEqual([["Valkyra", 1]]);

      expect(lastSeason.totalMatches + thisSeason.totalMatches).toBe(career.totalMatches);
      expect(lastSeason.totalKills + thisSeason.totalKills).toBe(career.totalKills);
      expect(lastSeason.totalDeaths + thisSeason.totalDeaths).toBe(career.totalDeaths);
      expect(career.factionWins.map(({ faction, wins }) => [faction, wins])).toEqual([
        ["Lonestar", 2],
        ["Valkyra", 2],
      ]);
    });
  });
});
