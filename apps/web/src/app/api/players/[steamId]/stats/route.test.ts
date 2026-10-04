import {
  createDb,
  currentSeason,
  playerCareerStats,
  playerSeasonStats,
  seasons,
  servers,
  type Database,
} from "@wdza-stats/db";
import { gt } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { GET } from "./route";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = process.env.RCON_BASE_URL!;

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
});

afterAll(async () => {
  await db.$client.end();
});

function request(steamId: string, query = "") {
  return new Request(`http://test/api/players/${steamId}/stats${query}`);
}

describe("GET /api/players/[steamId]/stats", () => {
  it("returns 404 for an unknown steamId", async () => {
    const response = await GET(request("unknown"), {
      params: Promise.resolve({ steamId: "unknown" }),
    });

    expect(response.status).toBe(404);
  });

  it("returns the player's lifetime stats", async () => {
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
      matchesPlayed: 10,
      matchesWon: 6,
      matchesLost: 4,
      highestKillStreak: 12,
      currentKillStreak: 3,
      mvpCount: 2,
    });

    const response = await GET(request("1"), {
      params: Promise.resolve({ steamId: "1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      steamId: "1",
      kills: 30,
      deaths: 6,
      kd: 5,
      cash: 2500,
      matchesPlayed: 10,
      matchesWon: 6,
      matchesLost: 4,
      highestKillStreak: 12,
      currentKillStreak: 3,
      mvpCount: 2,
    });
  });

  it("renders zeroed defaults for a player with no gamification activity yet", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();
    await db.insert(playerCareerStats).values({
      serverId: server.id,
      steamId: "1",
      displayName: "Alice",
    });

    const response = await GET(request("1"), {
      params: Promise.resolve({ steamId: "1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      steamId: "1",
      kills: 0,
      deaths: 0,
      kd: 0,
      cash: 0,
      matchesPlayed: 0,
      matchesWon: 0,
      matchesLost: 0,
      highestKillStreak: 0,
      currentKillStreak: 0,
      mvpCount: 0,
    });
  });

  describe("with Seasons", () => {
    // Alice played only in the earlier Season.
    async function seed() {
      const [server] = await db
        .insert(servers)
        .values({ name: "WDZA Test", baseUrl: BASE_URL })
        .returning();
      const past = await currentSeason(db);
      const [current] = await db.insert(seasons).values({ number: baseline + 1, name: "Dust Storm" }).returning();
      await db.insert(playerCareerStats).values({
        serverId: server.id,
        steamId: "1",
        displayName: "Alice",
        kills: 12,
        deaths: 4,
        matchesPlayed: 3,
      });
      await db.insert(playerSeasonStats).values({
        seasonId: past.id,
        serverId: server.id,
        steamId: "1",
        kills: 12,
        deaths: 4,
        matchesPlayed: 3,
      });
      return { past, current };
    }

    const get = (steamId: string, query: string) =>
      GET(request(steamId, query), { params: Promise.resolve({ steamId }) });

    it("still returns the flat Career stats when no season is asked for", async () => {
      await seed();

      const body = await (await get("1", "")).json();

      expect(body).toEqual({
        steamId: "1",
        kills: 12,
        deaths: 4,
        kd: 3,
        cash: 0,
        matchesPlayed: 3,
        matchesWon: 0,
        matchesLost: 0,
        highestKillStreak: 0,
        currentKillStreak: 0,
        mvpCount: 0,
      });
    });

    it("returns the player's stats for a Season they played in", async () => {
      const { past } = await seed();

      const body = await (await get("1", `?season=${past.number}`)).json();

      expect(body.steamId).toBe("1");
      expect(body.season).toMatchObject({ number: past.number });
      expect(body.stats).toMatchObject({ kills: 12, deaths: 4, matchesPlayed: 3 });
    });

    it("returns explicitly empty stats, not a 404, for a Season the player played no Match in", async () => {
      const { current } = await seed();

      const response = await get("1", "?season=current");

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        steamId: "1",
        season: { number: current.number, name: "Dust Storm", startedAt: current.startedAt.toISOString() },
        stats: null,
      });
    });

    it("answers 404 for an unknown Season, and for an unknown player in a Season", async () => {
      await seed();

      const unknownSeason = await get("1", `?season=${baseline + 5}`);
      expect(unknownSeason.status).toBe(404);
      expect((await unknownSeason.json()).error).toBe(`Unknown season: ${baseline + 5}`);

      const unknownPlayer = await get("unknown", "?season=current");
      expect(unknownPlayer.status).toBe(404);
      expect((await unknownPlayer.json()).error).toBe("No player found with steamId unknown");
    });
  });
});
