import {
  createDb,
  matches,
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
  await db.delete(matches);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

function request(url: string) {
  return new Request(url);
}

describe("GET /api/matches", () => {
  it("returns an empty first page when nothing is seeded", async () => {
    const response = await GET(request("http://test/api/matches"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ page: 1, pageSize: 25, totalCount: 0, totalPages: 0, rows: [] });
  });

  it("returns a paginated list of closed Matches with map, date, winner, MVP, and player count", async () => {
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

    await db.insert(playerMatchStats).values({
      matchId: match.id,
      steamId: "1",
      faction: "Lonestar",
      kills: 5,
      deaths: 2,
      cash: 100,
    });

    const response = await GET(request("http://test/api/matches"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.page).toBe(1);
    expect(body.totalCount).toBe(1);
    expect(body.rows).toEqual([
      {
        id: match.id,
        map: "Foundry",
        experiences: ["Frontline"],
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:30:00.000Z",
        playerCount: 1,
        winningFaction: "Lonestar",
        mvpPlayerSteamId: "1",
        mvpDisplayName: "1",
      },
    ]);
  });

  it("reads the page number from the query string", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(matches).values({
      serverId: server.id,
      map: "Foundry",
      experiences: ["Frontline"],
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
      endedAt: new Date("2026-01-01T00:30:00.000Z"),
    });

    const response = await GET(request("http://test/api/matches?page=2"));
    const body = await response.json();

    expect(body.page).toBe(2);
    expect(body.rows).toEqual([]);
  });
});
