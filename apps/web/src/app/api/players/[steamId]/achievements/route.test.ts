import {
  createDb,
  playerAchievements,
  playerCareerStats,
  servers,
  type Database,
} from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = process.env.RCON_BASE_URL!;

afterEach(async () => {
  await db.delete(playerAchievements);
  await db.delete(playerCareerStats);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

function request(steamId: string) {
  return new Request(`http://test/api/players/${steamId}/achievements`);
}

describe("GET /api/players/[steamId]/achievements", () => {
  it("returns an empty list for a player with no unlocked Achievements", async () => {
    await db.insert(servers).values({ name: "WDZA Test", baseUrl: BASE_URL });

    const response = await GET(request("1"), {
      params: Promise.resolve({ steamId: "1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([]);
  });

  it("returns an empty list for a player with a PlayerCareerStat row but no gamification activity yet", async () => {
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
    expect(body).toEqual([]);
  });

  it("returns the player's unlocked Achievements, most recently unlocked first", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();
    const [older] = await db
      .insert(playerAchievements)
      .values({
        serverId: server.id,
        steamId: "1",
        achievementId: "first_blood",
        unlockedAt: new Date("2026-03-01T00:00:00Z"),
      })
      .returning();
    const [newer] = await db
      .insert(playerAchievements)
      .values({
        serverId: server.id,
        steamId: "1",
        achievementId: "killing_spree",
        unlockedAt: new Date("2026-03-05T00:00:00Z"),
      })
      .returning();

    const response = await GET(request("1"), {
      params: Promise.resolve({ steamId: "1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([
      {
        id: "killing_spree",
        name: "Killing Spree",
        description: "Reach a 5 kill streak",
        unlockedAt: newer.unlockedAt.toISOString(),
      },
      {
        id: "first_blood",
        name: "First Blood",
        description: "Get the first kill of the game",
        unlockedAt: older.unlockedAt.toISOString(),
      },
    ]);
  });

  it("ignores ?season=, since Achievements are unlocked once per Server, ever", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();
    await db.insert(playerAchievements).values({ serverId: server.id, steamId: "1", achievementId: "first_blood" });
    const get = async (url: string) =>
      (await GET(new Request(url), { params: Promise.resolve({ steamId: "1" }) })).json();

    const career = await get("http://test/api/players/1/achievements");

    expect(career).toHaveLength(1);
    expect(await get("http://test/api/players/1/achievements?season=current")).toEqual(career);
    expect(await get("http://test/api/players/1/achievements?season=9999")).toEqual(career);
  });
});
