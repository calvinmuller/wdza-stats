import {
  bannedPlayers,
  createDb,
  playerAchievements,
  playerCareerStats,
  servers,
  steamProfiles,
  type Database,
} from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { MAX_BULK_STEAM_IDS } from "@/lib/player-progression";
import { GET } from "./route";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = process.env.RCON_BASE_URL!;

afterEach(async () => {
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
});
