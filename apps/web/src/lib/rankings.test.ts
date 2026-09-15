import {
  createDb,
  playerCareerStats,
  servers,
  steamProfiles,
  type Database,
} from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { getRankings, RANKINGS_PAGE_SIZE } from "./rankings";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = "http://rankings.test:9006";

afterEach(async () => {
  await db.delete(playerCareerStats);
  await db.delete(servers);
  await db.delete(steamProfiles);
});

afterAll(async () => {
  await db.$client.end();
});

describe("getRankings", () => {
  it("returns an empty page when the Server isn't seeded", async () => {
    const result = await getRankings(db, BASE_URL, "xp", 1);

    expect(result).toEqual({
      metric: "xp",
      page: 1,
      pageSize: RANKINGS_PAGE_SIZE,
      totalCount: 0,
      totalPages: 0,
      rows: [],
    });
  });

  it("returns an empty page when the Server has no PlayerCareerStat rows", async () => {
    await db.insert(servers).values({ name: "WDZA Test", baseUrl: BASE_URL });

    const result = await getRankings(db, BASE_URL, "xp", 1);

    expect(result.rows).toEqual([]);
  });

  it("ranks players by the requested metric, highest first, with server-computed rank", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(playerCareerStats).values([
      { serverId: server.id, steamId: "1", displayName: "Alice", xp: 500, kills: 5, matchesWon: 1, highestKillStreak: 2 },
      { serverId: server.id, steamId: "2", displayName: "Bob", xp: 2000, kills: 50, matchesWon: 10, highestKillStreak: 8 },
      { serverId: server.id, steamId: "3", displayName: "Carol", xp: 100, kills: 1, matchesWon: 0, highestKillStreak: 1 },
    ]);

    const byXp = await getRankings(db, BASE_URL, "xp", 1);
    expect(byXp.rows).toEqual([
      { rank: 1, steamId: "2", displayName: "Bob", avatarUrl: null, value: 2000 },
      { rank: 2, steamId: "1", displayName: "Alice", avatarUrl: null, value: 500 },
      { rank: 3, steamId: "3", displayName: "Carol", avatarUrl: null, value: 100 },
    ]);
    expect(byXp.totalCount).toBe(3);
    expect(byXp.totalPages).toBe(1);

    const byWins = await getRankings(db, BASE_URL, "wins", 1);
    expect(byWins.rows.map((row) => row.steamId)).toEqual(["2", "1", "3"]);

    const byStreaks = await getRankings(db, BASE_URL, "streaks", 1);
    expect(byStreaks.rows.map((row) => row.steamId)).toEqual(["2", "1", "3"]);

    const byKills = await getRankings(db, BASE_URL, "kills", 1);
    expect(byKills.rows.map((row) => row.steamId)).toEqual(["2", "1", "3"]);
  });

  it("paginates correctly at a page boundary", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    // Exactly one page's worth, plus one extra player who should spill
    // onto page 2 alone.
    await db.insert(playerCareerStats).values(
      Array.from({ length: RANKINGS_PAGE_SIZE + 1 }, (_, index) => ({
        serverId: server.id,
        steamId: `p${index}`,
        displayName: `Player ${index}`,
        xp: RANKINGS_PAGE_SIZE + 1 - index,
      })),
    );

    const page1 = await getRankings(db, BASE_URL, "xp", 1);
    expect(page1.rows).toHaveLength(RANKINGS_PAGE_SIZE);
    expect(page1.rows[0]).toMatchObject({ rank: 1, steamId: "p0" });
    expect(page1.rows.at(-1)).toMatchObject({
      rank: RANKINGS_PAGE_SIZE,
      steamId: `p${RANKINGS_PAGE_SIZE - 1}`,
    });
    expect(page1.totalPages).toBe(2);

    const page2 = await getRankings(db, BASE_URL, "xp", 2);
    expect(page2.rows).toHaveLength(1);
    expect(page2.rows[0]).toMatchObject({
      rank: RANKINGS_PAGE_SIZE + 1,
      steamId: `p${RANKINGS_PAGE_SIZE}`,
    });

    const page3 = await getRankings(db, BASE_URL, "xp", 3);
    expect(page3.rows).toEqual([]);
  });

  it("scopes rankings to the requested Server only", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();
    const [otherServer] = await db
      .insert(servers)
      .values({ name: "Other Server", baseUrl: "http://other.test:9006" })
      .returning();

    await db.insert(playerCareerStats).values([
      { serverId: server.id, steamId: "1", displayName: "Alice", xp: 10 },
      { serverId: otherServer.id, steamId: "2", displayName: "Bob", xp: 9999 },
    ]);

    const result = await getRankings(db, BASE_URL, "xp", 1);

    expect(result.rows.map((row) => row.displayName)).toEqual(["Alice"]);
  });

  it("includes each player's cached avatar", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(playerCareerStats).values({
      serverId: server.id,
      steamId: "1",
      displayName: "Alice",
      xp: 10,
    });
    await db.insert(steamProfiles).values({
      steamId: "1",
      personaName: null,
      avatarUrl: "https://example.com/avatar.jpg",
      achievements: [],
      playtimeMinutes: null,
      status: "ok",
      fetchedAt: new Date(),
    });

    const [row] = (await getRankings(db, BASE_URL, "xp", 1)).rows;

    expect(row.avatarUrl).toBe("https://example.com/avatar.jpg");
  });
});
