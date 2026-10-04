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

function request(url: string) {
  return new Request(url);
}

describe("GET /api/leaderboards/[metric]", () => {
  it("returns 400 for an unknown metric", async () => {
    const response = await GET(request("http://test/api/leaderboards/bogus"), {
      params: Promise.resolve({ metric: "bogus" }),
    });

    expect(response.status).toBe(400);
  });

  it("returns a paginated, ranked leaderboard for a known metric", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(playerCareerStats).values([
      { serverId: server.id, steamId: "1", displayName: "Alice", xp: 100 },
      { serverId: server.id, steamId: "2", displayName: "Bob", xp: 500 },
    ]);

    const response = await GET(request("http://test/api/leaderboards/xp"), {
      params: Promise.resolve({ metric: "xp" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.metric).toBe("xp");
    expect(body.page).toBe(1);
    expect(body.totalCount).toBe(2);
    expect(body.rows).toEqual([
      { rank: 1, steamId: "2", displayName: "Bob", avatarUrl: null, countryCode: null, level: 1, value: 500 },
      { rank: 2, steamId: "1", displayName: "Alice", avatarUrl: null, countryCode: null, level: 1, value: 100 },
    ]);
  });

  it("reads the page number from the query string", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(playerCareerStats).values({
      serverId: server.id,
      steamId: "1",
      displayName: "Alice",
      xp: 100,
    });

    const response = await GET(
      request("http://test/api/leaderboards/xp?page=2"),
      { params: Promise.resolve({ metric: "xp" }) },
    );
    const body = await response.json();

    expect(body.page).toBe(2);
    expect(body.rows).toEqual([]);
  });

  describe("with Seasons", () => {
    async function seed() {
      const [server] = await db
        .insert(servers)
        .values({ name: "WDZA Test", baseUrl: BASE_URL })
        .returning();
      const past = await currentSeason(db);
      const [current] = await db.insert(seasons).values({ number: baseline + 1 }).returning();

      await db.insert(playerCareerStats).values([
        { serverId: server.id, steamId: "1", displayName: "Alice", xp: 100, matchesPlayed: 1 },
        { serverId: server.id, steamId: "2", displayName: "Bob", xp: 500, matchesPlayed: 2 },
      ]);
      await db.insert(playerSeasonStats).values([
        { seasonId: past.id, serverId: server.id, steamId: "1", xp: 100, matchesPlayed: 1 },
        { seasonId: past.id, serverId: server.id, steamId: "2", xp: 450, matchesPlayed: 1 },
        { seasonId: current.id, serverId: server.id, steamId: "2", xp: 50, matchesPlayed: 1 },
      ]);
      return { past, current };
    }

    const get = (query: string) =>
      GET(request(`http://test/api/leaderboards/xp${query}`), { params: Promise.resolve({ metric: "xp" }) });

    it("still returns Career, unchanged, when no season is asked for", async () => {
      await seed();

      const body = await (await get("")).json();

      expect(body).toEqual({
        metric: "xp",
        page: 1,
        pageSize: 25,
        totalCount: 2,
        totalPages: 1,
        rows: [
          { rank: 1, steamId: "2", displayName: "Bob", avatarUrl: null, countryCode: null, level: 1, value: 500 },
          { rank: 2, steamId: "1", displayName: "Alice", avatarUrl: null, countryCode: null, level: 1, value: 100 },
        ],
      });
    });

    it("returns the current Season's rankings for ?season=current, and a past Season's by number", async () => {
      const { past, current } = await seed();

      const thisSeason = await (await get("?season=current")).json();
      expect(thisSeason.season).toMatchObject({ number: current.number, name: null });
      expect(thisSeason.rows.map((row: { displayName: string; value: number }) => [row.displayName, row.value])).toEqual([
        ["Bob", 50],
      ]);

      const lastSeason = await (await get(`?season=${past.number}`)).json();
      expect(lastSeason.season).toMatchObject({ number: past.number });
      expect(lastSeason.rows.map((row: { displayName: string; value: number }) => [row.displayName, row.value])).toEqual([
        ["Bob", 450],
        ["Alice", 100],
      ]);
    });

    it("answers 404 for a Season that doesn't exist", async () => {
      await seed();

      const response = await get(`?season=${baseline + 2}`);

      expect(response.status).toBe(404);
      expect((await response.json()).error).toBe(`Unknown season: ${baseline + 2}`);
    });
  });
});
