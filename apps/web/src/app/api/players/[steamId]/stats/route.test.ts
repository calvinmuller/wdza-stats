import {
  createDb,
  playerCareerStats,
  servers,
  type Database,
} from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = process.env.RCON_BASE_URL!;

afterEach(async () => {
  await db.delete(playerCareerStats);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

function request(steamId: string) {
  return new Request(`http://test/api/players/${steamId}/stats`);
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
});
