import {
  createDb,
  matches,
  playerCareerStats,
  playerMatchStats,
  servers,
  type Database,
} from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = process.env.RCON_BASE_URL!;

afterEach(async () => {
  await db.delete(playerMatchStats);
  await db.delete(playerCareerStats);
  await db.delete(matches);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

function request(id: string) {
  return new Request(`http://test/api/matches/${id}`);
}

describe("GET /api/matches/[id]", () => {
  it("returns 400 for a non-integer id", async () => {
    const response = await GET(request("bogus"), {
      params: Promise.resolve({ id: "bogus" }),
    });

    expect(response.status).toBe(400);
  });

  it("returns 404 for an unknown match id", async () => {
    const response = await GET(request("999"), {
      params: Promise.resolve({ id: "999" }),
    });

    expect(response.status).toBe(404);
  });

  it("returns full detail for a seeded Match, including top players by kills", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    const [match] = await db
      .insert(matches)
      .values({
        serverId: server.id,
        map: "Foundry",
        experiences: ["Frontline"],
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        endedAt: new Date("2026-01-01T00:30:00.000Z"),
        winningFaction: "Lonestar",
        mvpPlayerSteamId: "1",
        mvpScore: 40,
      })
      .returning();

    await db.insert(playerCareerStats).values([
      { serverId: server.id, steamId: "1", displayName: "Alice", matchesPlayed: 1 },
      { serverId: server.id, steamId: "2", displayName: "Bob", matchesPlayed: 1 },
    ]);

    await db.insert(playerMatchStats).values([
      { matchId: match.id, steamId: "1", faction: "Lonestar", kills: 5, deaths: 2, cash: 100 },
      { matchId: match.id, steamId: "2", faction: "Valkyra", kills: 3, deaths: 4, cash: 50 },
    ]);

    const response = await GET(request(String(match.id)), {
      params: Promise.resolve({ id: String(match.id) }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBe(match.id);
    expect(body.winningFaction).toBe("Lonestar");
    expect(body.mvpDisplayName).toBe("Alice");
    expect(body.players.map((player: { steamId: string }) => player.steamId)).toEqual([
      "1",
      "2",
    ]);
  });
});
