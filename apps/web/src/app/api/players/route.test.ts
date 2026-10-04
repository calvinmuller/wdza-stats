import {
  bannedPlayers,
  createDb,
  currentSeason,
  playerAchievements,
  playerCareerStats,
  playerSeasonStats,
  seasons,
  servers,
  steamProfiles,
  type Database,
} from "@wdza-stats/db";
import { gt } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MAX_BULK_STEAM_IDS } from "@/lib/player-progression";
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
  await db.delete(bannedPlayers);
  await db.delete(steamProfiles);
  await db.delete(playerAchievements);
  await db.delete(playerCareerStats);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

function request(query: string) {
  return new Request(`http://test/api/players${query}`);
}

describe("GET /api/players", () => {
  it("returns 400 without any steamIds", async () => {
    expect((await GET(request(""))).status).toBe(400);
    expect((await GET(request("?steamIds=, ,"))).status).toBe(400);
  });

  it("returns 400 for more steamIds than one request allows", async () => {
    const steamIds = Array.from({ length: MAX_BULK_STEAM_IDS + 1 }, (_, i) => String(i));

    const response = await GET(request(`?steamIds=${steamIds.join(",")}`));

    expect(response.status).toBe(400);
  });

  it("returns each known player's details in request order, and lists unknown or banned steamIds as notFound", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();
    await db.insert(playerCareerStats).values([
      { serverId: server.id, steamId: "1", displayName: "Alice", xp: 1300, kills: 10, deaths: 5 },
      { serverId: server.id, steamId: "2", displayName: "Bob" },
      { serverId: server.id, steamId: "3", displayName: "Banned Carl" },
    ]);
    await db.insert(bannedPlayers).values({ steamId: "3" });
    const [unlock] = await db
      .insert(playerAchievements)
      .values({
        serverId: server.id,
        steamId: "1",
        achievementId: "first_blood",
        unlockedAt: new Date("2026-03-01T00:00:00Z"),
      })
      .returning();
    await db.insert(steamProfiles).values({
      steamId: "1",
      personaName: "CoolGuy123",
      avatarUrl: "https://example.com/avatar.jpg",
      achievements: [],
      playtimeMinutes: 90,
      status: "ok",
      fetchedAt: new Date(),
    });

    const response = await GET(request("?steamIds=2, 1,unknown,3,1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.notFound).toEqual(["unknown", "3"]);
    expect(body.players.map((player: { steamId: string }) => player.steamId)).toEqual(["2", "1"]);

    const alice = body.players[1];
    expect(alice.progression).toMatchObject({
      displayName: "Alice",
      personaName: "CoolGuy123",
      level: 2,
      xp: 1300,
    });
    expect(alice.stats).toMatchObject({ kills: 10, deaths: 5, kd: 2 });
    expect(alice.achievements).toEqual([
      {
        id: "first_blood",
        name: "First Blood",
        description: "Get the first kill of the game",
        unlockedAt: unlock.unlockedAt.toISOString(),
      },
    ]);
    expect(alice.challenges).toEqual([]);
    expect(alice.steamAchievements).toEqual([]);
    expect(alice.playtimeMinutes).toBe(90);

    const bob = body.players[0];
    expect(bob.achievements).toEqual([]);
    expect(bob.playtimeMinutes).toBeNull();
  });

  describe("with Seasons", () => {
    // Alice played in both Seasons; Bob only in the earlier one.
    async function seed() {
      const [server] = await db
        .insert(servers)
        .values({ name: "WDZA Test", baseUrl: BASE_URL })
        .returning();
      const past = await currentSeason(db);
      const [current] = await db.insert(seasons).values({ number: baseline + 1 }).returning();
      await db.insert(playerCareerStats).values([
        { serverId: server.id, steamId: "1", displayName: "Alice", xp: 1300, kills: 10, matchesPlayed: 3 },
        { serverId: server.id, steamId: "2", displayName: "Bob", kills: 4, matchesPlayed: 1 },
      ]);
      await db.insert(playerSeasonStats).values([
        { seasonId: past.id, serverId: server.id, steamId: "1", xp: 1000, kills: 7, matchesPlayed: 2 },
        { seasonId: past.id, serverId: server.id, steamId: "2", kills: 4, matchesPlayed: 1 },
        { seasonId: current.id, serverId: server.id, steamId: "1", xp: 300, kills: 3, matchesPlayed: 1 },
      ]);
      return { past, current };
    }

    it("returns Career stats, with no season field, when no season is asked for", async () => {
      await seed();

      const body = await (await GET(request("?steamIds=1,2"))).json();

      expect(body).not.toHaveProperty("season");
      expect(body.players.map((player: { stats: { kills: number } }) => player.stats.kills)).toEqual([10, 4]);
    });

    it("returns each player's Season stats for ?season=, null for a player with no Match in it", async () => {
      const { current } = await seed();

      const body = await (await GET(request("?steamIds=1,2&season=current"))).json();

      expect(body.season).toMatchObject({ number: current.number });
      expect(body.notFound).toEqual([]);
      const [alice, bob] = body.players;
      expect(alice.stats).toMatchObject({ kills: 3, matchesPlayed: 1 });
      // Progression stays career-long.
      expect(alice.progression).toMatchObject({ xp: 1300, level: 2 });
      expect(bob.steamId).toBe("2");
      expect(bob.stats).toBeNull();
    });

    it("answers 404 for an unknown Season", async () => {
      await seed();

      const response = await GET(request(`?steamIds=1&season=${baseline + 5}`));

      expect(response.status).toBe(404);
      expect((await response.json()).error).toBe(`Unknown season: ${baseline + 5}`);
    });
  });
});
