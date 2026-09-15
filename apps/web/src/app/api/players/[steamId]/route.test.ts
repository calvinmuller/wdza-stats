import {
  createDb,
  latestSnapshots,
  playerCareerStats,
  servers,
  steamProfiles,
  type Database,
} from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { snapshotFixture } from "@/lib/live-snapshot-fixture";
import { GET } from "./route";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = process.env.RCON_BASE_URL!;

afterEach(async () => {
  await db.delete(latestSnapshots);
  await db.delete(steamProfiles);
  await db.delete(playerCareerStats);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

function request(steamId: string) {
  return new Request(`http://test/api/players/${steamId}`);
}

describe("GET /api/players/[steamId]", () => {
  it("returns 404 for an unknown steamId", async () => {
    const response = await GET(request("unknown"), {
      params: Promise.resolve({ steamId: "unknown" }),
    });

    expect(response.status).toBe(404);
  });

  it("returns the player's identity plus level/xp/progress", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();
    await db.insert(playerCareerStats).values({
      serverId: server.id,
      steamId: "1",
      displayName: "Alice",
      xp: 1300,
    });

    const response = await GET(request("1"), {
      params: Promise.resolve({ steamId: "1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      steamId: "1",
      displayName: "Alice",
      personaName: null,
      avatarUrl: null,
      factionColor: null,
      level: 2,
      xp: 1300,
      xpIntoLevel: 300,
      xpRequiredForNextLevel: 1500,
      progressPercent: 20,
    });
  });

  it("renders sensible defaults for a player with no gamification activity yet", async () => {
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
      displayName: "Alice",
      personaName: null,
      avatarUrl: null,
      factionColor: null,
      level: 1,
      xp: 0,
      xpIntoLevel: 0,
      xpRequiredForNextLevel: 1000,
      progressPercent: 0,
    });
  });

  it("enriches identity with cached SteamProfile data and the player's current online Faction color", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();
    await db.insert(playerCareerStats).values({
      serverId: server.id,
      steamId: "1",
      displayName: "Alice",
    });
    await db.insert(steamProfiles).values({
      steamId: "1",
      personaName: "CoolGuy123",
      avatarUrl: "https://example.com/avatar.jpg",
      achievements: [],
      status: "ok",
      fetchedAt: new Date(),
    });
    await db.insert(latestSnapshots).values({
      serverId: server.id,
      capturedAt: new Date("2026-01-01T00:00:00.000Z"),
      payload: snapshotFixture({
        factions: [{ name: "Valkyra", color: "#0000ff", score: 10 }],
        players: [
          {
            steamId: "1",
            displayName: "Alice",
            faction: "Valkyra",
            kills: 0,
            deaths: 0,
            cash: 0,
            ping: 20,
          },
        ],
      }),
    });

    const response = await GET(request("1"), {
      params: Promise.resolve({ steamId: "1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.personaName).toBe("CoolGuy123");
    expect(body.avatarUrl).toBe("https://example.com/avatar.jpg");
    expect(body.factionColor).toBe("#0000ff");
  });
});
