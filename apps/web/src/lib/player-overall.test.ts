import {
  bannedPlayers,
  createDb,
  currentSeason,
  playerCareerStats,
  playerSeasonStats,
  seasons,
  servers,
  steamProfiles,
  type Database,
  type Season,
} from "@wdza-stats/db";
import { gt } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getPlayerOverall } from "./player-overall";

const db: Database = createDb(process.env.DATABASE_URL!);

// Season 1 comes from the migration; tests add Seasons above it.
let baseline: number;
let season: Season;

beforeAll(async () => {
  season = await currentSeason(db);
  baseline = season.number;
});

afterEach(async () => {
  await db.delete(playerSeasonStats);
  await db.delete(seasons).where(gt(seasons.number, baseline));
  await db.delete(playerCareerStats);
  await db.delete(servers);
  await db.delete(steamProfiles);
  await db.delete(bannedPlayers);
});

afterAll(async () => {
  await db.$client.end();
});

async function addServer(slug: string, enabled = true) {
  const [server] = await db
    .insert(servers)
    .values({ name: `WDZA ${slug}`, slug, baseUrl: `http://${slug}.test:9101`, enabled })
    .returning();
  return server;
}

const CAREER = { kind: "career" } as const;

describe("getPlayerOverall", () => {
  it("sums a player's career totals across every enabled Server, with each Server's own level", async () => {
    const alpha = await addServer("alpha");
    const bravo = await addServer("bravo");
    const retired = await addServer("retired", false);
    await db.insert(playerCareerStats).values([
      // 1,500 XP is level 2 on its own Server; 3,000 summed is overall level 3.
      { serverId: alpha.id, steamId: "1", displayName: "Alice", xp: 1500, kills: 30, deaths: 10, cash: 100, matchesPlayed: 5, matchesWon: 3, matchesLost: 2, highestKillStreak: 4, mvpCount: 1 },
      { serverId: bravo.id, steamId: "1", displayName: "AliceB", xp: 1500, kills: 10, deaths: 10, cash: 50, matchesPlayed: 4, matchesWon: 1, matchesLost: 3, highestKillStreak: 9, mvpCount: 2 },
      { serverId: retired.id, steamId: "1", displayName: "Alice", xp: 90000, kills: 999 },
    ]);
    await db.insert(steamProfiles).values({
      steamId: "1",
      personaName: "alice_steam",
      avatarUrl: "https://avatars.test/alice.jpg",
      countryCode: "ZA",
      achievements: [],
      status: "ok",
      fetchedAt: new Date(),
    });

    const overall = await getPlayerOverall(db, "1", CAREER);

    expect(overall?.identity).toMatchObject({
      displayName: "Alice",
      avatarUrl: "https://avatars.test/alice.jpg",
      careerXp: 3000,
      level: 3,
    });
    expect(overall?.totals).toEqual({
      xp: 3000,
      kills: 40,
      deaths: 20,
      kd: 2,
      cash: 150,
      matchesPlayed: 9,
      matchesWon: 4,
      matchesLost: 5,
      highestKillStreak: 9,
      mvpCount: 3,
    });
    expect(overall?.servers).toEqual([
      { slug: "alpha", name: "WDZA alpha", level: 2, xp: 1500, kills: 30, deaths: 10, kd: 3, matchesPlayed: 5, matchesWon: 3 },
      { slug: "bravo", name: "WDZA bravo", level: 2, xp: 1500, kills: 10, deaths: 10, kd: 1, matchesPlayed: 4, matchesWon: 1 },
    ]);
  });

  it("sums only one Season's totals in a Season scope, keeping the level career-long", async () => {
    const alpha = await addServer("alpha");
    const bravo = await addServer("bravo");
    await db.insert(playerCareerStats).values([
      { serverId: alpha.id, steamId: "1", displayName: "Alice", xp: 1500, kills: 30, matchesPlayed: 5 },
      { serverId: bravo.id, steamId: "1", displayName: "Alice", xp: 1500, kills: 10, matchesPlayed: 4 },
    ]);
    // Played on alpha this Season; bravo only has a row from a still-open Match.
    await db.insert(playerSeasonStats).values([
      { seasonId: season.id, serverId: alpha.id, steamId: "1", xp: 200, kills: 4, deaths: 2, matchesPlayed: 1, matchesWon: 1 },
      { seasonId: season.id, serverId: bravo.id, steamId: "1", kills: 1 },
    ]);

    const overall = await getPlayerOverall(db, "1", { kind: "season", season });

    expect(overall?.identity.level).toBe(3);
    expect(overall?.totals).toMatchObject({ xp: 200, kills: 4, deaths: 2, kd: 2, matchesPlayed: 1, matchesWon: 1 });
    expect(overall?.servers).toEqual([
      { slug: "alpha", name: "WDZA alpha", level: 2, xp: 200, kills: 4, deaths: 2, kd: 2, matchesPlayed: 1, matchesWon: 1 },
    ]);
  });

  it("has no totals in a Season the player played no Match in", async () => {
    const alpha = await addServer("alpha");
    await db.insert(playerCareerStats).values({ serverId: alpha.id, steamId: "1", displayName: "Alice", xp: 100 });

    const overall = await getPlayerOverall(db, "1", { kind: "season", season });

    expect(overall?.identity.displayName).toBe("Alice");
    expect(overall?.totals).toBeNull();
    expect(overall?.servers).toEqual([]);
  });

  it("is null for a banned player, an unknown one, or one only seen on a disabled Server", async () => {
    const alpha = await addServer("alpha");
    const retired = await addServer("retired", false);
    await db.insert(playerCareerStats).values([
      { serverId: alpha.id, steamId: "1", displayName: "Banned Bob" },
      { serverId: retired.id, steamId: "2", displayName: "Retired Rita" },
    ]);
    await db.insert(bannedPlayers).values({ steamId: "1" });

    expect(await getPlayerOverall(db, "1", CAREER)).toBeNull();
    expect(await getPlayerOverall(db, "2", CAREER)).toBeNull();
    expect(await getPlayerOverall(db, "3", CAREER)).toBeNull();
  });
});
