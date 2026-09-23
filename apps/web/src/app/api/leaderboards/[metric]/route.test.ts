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
});
