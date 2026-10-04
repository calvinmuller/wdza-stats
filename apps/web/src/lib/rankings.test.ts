import {
  createDb,
  currentSeason,
  playerCareerStats,
  playerSeasonStats,
  seasons,
  servers,
  steamProfiles,
  type Database,
} from "@wdza-stats/db";
import { gt } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getRankings, RANKINGS_PAGE_SIZE } from "./rankings";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = "http://rankings.test:9006";

// Season 1 comes from the migration; tests add Seasons above it.
let baseline: number;

beforeAll(async () => {
  baseline = (await currentSeason(db)).number;
});

afterEach(async () => {
  await db.delete(playerSeasonStats);
  await db.delete(seasons).where(gt(seasons.number, baseline));
  await db.delete(playerCareerStats);
  await db.delete(servers);
  await db.delete(steamProfiles);
});

afterAll(async () => {
  await db.$client.end();
});

describe("getRankings", () => {
  it("returns an empty page when the Server isn't seeded", async () => {
    const result = await getRankings(db, BASE_URL, "xp", 1);

    expect(result).toEqual({
      metric: "xp",
      page: 1,
      pageSize: RANKINGS_PAGE_SIZE,
      totalCount: 0,
      totalPages: 0,
      rows: [],
    });
  });

  it("returns an empty page when the Server has no PlayerCareerStat rows", async () => {
    await db.insert(servers).values({ name: "WDZA Test", baseUrl: BASE_URL });

    const result = await getRankings(db, BASE_URL, "xp", 1);

    expect(result.rows).toEqual([]);
  });

  it("ranks players by the requested metric, highest first, with server-computed rank", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(playerCareerStats).values([
      { serverId: server.id, steamId: "1", displayName: "Alice", xp: 500, kills: 5, matchesWon: 1, highestKillStreak: 2 },
      { serverId: server.id, steamId: "2", displayName: "Bob", xp: 2000, kills: 50, matchesWon: 10, highestKillStreak: 8 },
      { serverId: server.id, steamId: "3", displayName: "Carol", xp: 100, kills: 1, matchesWon: 0, highestKillStreak: 1 },
    ]);

    const byXp = await getRankings(db, BASE_URL, "xp", 1);
    expect(byXp.rows).toEqual([
      { rank: 1, steamId: "2", displayName: "Bob", avatarUrl: null, countryCode: null, level: expect.any(Number), value: 2000 },
      { rank: 2, steamId: "1", displayName: "Alice", avatarUrl: null, countryCode: null, level: expect.any(Number), value: 500 },
      { rank: 3, steamId: "3", displayName: "Carol", avatarUrl: null, countryCode: null, level: expect.any(Number), value: 100 },
    ]);
    const [bob, alice, carol] = byXp.rows;
    expect(bob.level).toBeGreaterThanOrEqual(alice.level);
    expect(alice.level).toBeGreaterThanOrEqual(carol.level);
    expect(byXp.totalCount).toBe(3);
    expect(byXp.totalPages).toBe(1);

    const byWins = await getRankings(db, BASE_URL, "wins", 1);
    expect(byWins.rows.map((row) => row.steamId)).toEqual(["2", "1", "3"]);

    const byStreaks = await getRankings(db, BASE_URL, "streaks", 1);
    expect(byStreaks.rows.map((row) => row.steamId)).toEqual(["2", "1", "3"]);

    const byKills = await getRankings(db, BASE_URL, "kills", 1);
    expect(byKills.rows.map((row) => row.steamId)).toEqual(["2", "1", "3"]);
  });

  it("paginates correctly at a page boundary", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    // Exactly one page's worth, plus one extra player who should spill
    // onto page 2 alone.
    await db.insert(playerCareerStats).values(
      Array.from({ length: RANKINGS_PAGE_SIZE + 1 }, (_, index) => ({
        serverId: server.id,
        steamId: `p${index}`,
        displayName: `Player ${index}`,
        xp: RANKINGS_PAGE_SIZE + 1 - index,
      })),
    );

    const page1 = await getRankings(db, BASE_URL, "xp", 1);
    expect(page1.rows).toHaveLength(RANKINGS_PAGE_SIZE);
    expect(page1.rows[0]).toMatchObject({ rank: 1, steamId: "p0" });
    expect(page1.rows.at(-1)).toMatchObject({
      rank: RANKINGS_PAGE_SIZE,
      steamId: `p${RANKINGS_PAGE_SIZE - 1}`,
    });
    expect(page1.totalPages).toBe(2);

    const page2 = await getRankings(db, BASE_URL, "xp", 2);
    expect(page2.rows).toHaveLength(1);
    expect(page2.rows[0]).toMatchObject({
      rank: RANKINGS_PAGE_SIZE + 1,
      steamId: `p${RANKINGS_PAGE_SIZE}`,
    });

    const page3 = await getRankings(db, BASE_URL, "xp", 3);
    expect(page3.rows).toEqual([]);
  });

  it("scopes rankings to the requested Server only", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();
    const [otherServer] = await db
      .insert(servers)
      .values({ name: "Other Server", baseUrl: "http://other.test:9006" })
      .returning();

    await db.insert(playerCareerStats).values([
      { serverId: server.id, steamId: "1", displayName: "Alice", xp: 10 },
      { serverId: otherServer.id, steamId: "2", displayName: "Bob", xp: 9999 },
    ]);

    const result = await getRankings(db, BASE_URL, "xp", 1);

    expect(result.rows.map((row) => row.displayName)).toEqual(["Alice"]);
  });

  it("includes each player's cached avatar", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(playerCareerStats).values({
      serverId: server.id,
      steamId: "1",
      displayName: "Alice",
      xp: 10,
    });
    await db.insert(steamProfiles).values({
      steamId: "1",
      personaName: null,
      avatarUrl: "https://example.com/avatar.jpg",
      achievements: [],
      playtimeMinutes: null,
      status: "ok",
      fetchedAt: new Date(),
    });

    const [row] = (await getRankings(db, BASE_URL, "xp", 1)).rows;

    expect(row.avatarUrl).toBe("https://example.com/avatar.jpg");
  });

  it("includes each player's cached country code", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(playerCareerStats).values({
      serverId: server.id,
      steamId: "1",
      displayName: "Alice",
      xp: 10,
    });
    await db.insert(steamProfiles).values({
      steamId: "1",
      personaName: null,
      avatarUrl: null,
      countryCode: "ZA",
      achievements: [],
      playtimeMinutes: null,
      status: "ok",
      fetchedAt: new Date(),
    });

    const [row] = (await getRankings(db, BASE_URL, "xp", 1)).rows;

    expect(row.countryCode).toBe("ZA");
  });

  describe("for a Season", () => {
    async function seedTwoSeasons() {
      const [server] = await db
        .insert(servers)
        .values({ name: "WDZA Test", baseUrl: BASE_URL })
        .returning();
      const past = await currentSeason(db);
      const [current] = await db
        .insert(seasons)
        .values({ number: baseline + 1, name: "Dust Storm" })
        .returning();

      // Career is the sum of both Seasons.
      await db.insert(playerCareerStats).values([
        { serverId: server.id, steamId: "1", displayName: "Alice", xp: 5000, kills: 60, matchesPlayed: 6 },
        { serverId: server.id, steamId: "2", displayName: "Bob", xp: 3000, kills: 30, matchesPlayed: 5 },
        { serverId: server.id, steamId: "3", displayName: "Carol", xp: 2600, kills: 40, matchesPlayed: 4 },
        { serverId: server.id, steamId: "4", displayName: "Dave", xp: 50, kills: 1, matchesPlayed: 1 },
      ]);
      await db.insert(playerSeasonStats).values([
        { seasonId: past.id, serverId: server.id, steamId: "1", xp: 5000, kills: 60, matchesPlayed: 6 },
        { seasonId: past.id, serverId: server.id, steamId: "2", xp: 2200, kills: 25, matchesPlayed: 3 },
        { seasonId: past.id, serverId: server.id, steamId: "3", xp: 1700, kills: 10, matchesPlayed: 1 },
        { seasonId: past.id, serverId: server.id, steamId: "4", xp: 50, kills: 1, matchesPlayed: 1 },
        // Alice hasn't played this Season.
        { seasonId: current.id, serverId: server.id, steamId: "2", xp: 800, kills: 5, matchesPlayed: 2 },
        { seasonId: current.id, serverId: server.id, steamId: "3", xp: 900, kills: 30, matchesPlayed: 3 },
        // Dave got a kill in a still-open Match: a row, but no Match played yet.
        { seasonId: current.id, serverId: server.id, steamId: "4", xp: 0, kills: 1, matchesPlayed: 0 },
      ]);

      return { past, current };
    }

    it("ranks only players who played a Match in that Season, by their Season totals", async () => {
      const { past, current } = await seedTwoSeasons();

      const thisSeason = await getRankings(db, BASE_URL, "xp", 1, { kind: "season", season: current });
      expect(thisSeason.rows.map((row) => [row.displayName, row.value])).toEqual([
        ["Carol", 900],
        ["Bob", 800],
      ]);
      expect(thisSeason.totalCount).toBe(2);
      expect(thisSeason.season).toEqual({ number: current.number, name: "Dust Storm", startedAt: current.startedAt });

      const byKills = await getRankings(db, BASE_URL, "kills", 1, { kind: "season", season: current });
      expect(byKills.rows.map((row) => [row.displayName, row.value])).toEqual([
        ["Carol", 30],
        ["Bob", 5],
      ]);

      const lastSeason = await getRankings(db, BASE_URL, "xp", 1, { kind: "season", season: past });
      expect(lastSeason.rows.map((row) => [row.displayName, row.value])).toEqual([
        ["Alice", 5000],
        ["Bob", 2200],
        ["Carol", 1700],
        ["Dave", 50],
      ]);

      const career = await getRankings(db, BASE_URL, "xp", 1, { kind: "career" });
      expect(career.rows.map((row) => [row.displayName, row.value])).toEqual([
        ["Alice", 5000],
        ["Bob", 3000],
        ["Carol", 2600],
        ["Dave", 50],
      ]);
      expect(career).not.toHaveProperty("season");
    });

    it("shows each player's career level, never one derived from Season XP", async () => {
      const { current } = await seedTwoSeasons();

      const [carol] = (await getRankings(db, BASE_URL, "xp", 1, { kind: "season", season: current })).rows;

      // 2,600 career XP is level 3; Carol's 900 Season XP alone would be level 1.
      expect(carol).toMatchObject({ displayName: "Carol", value: 900, level: 3 });
    });
  });
});
