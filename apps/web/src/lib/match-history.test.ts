import {
  createDb,
  matches,
  playerCareerStats,
  playerMatchStats,
  servers,
  type Database,
} from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  getMatchDetail,
  getPlayerMatchHistory,
  getRecentMatches,
} from "./match-history";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = "http://match-history.test:9006";

afterEach(async () => {
  await db.delete(playerMatchStats);
  await db.delete(playerCareerStats);
  await db.delete(matches);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

describe("getRecentMatches", () => {
  it("returns an empty list when the Server isn't seeded", async () => {
    const result = await getRecentMatches(db, BASE_URL);

    expect(result).toEqual([]);
  });

  it("returns an empty list when the Server has no closed Matches", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(matches).values({
      serverId: server.id,
      map: "Foundry",
      experiences: ["Frontline"],
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const result = await getRecentMatches(db, BASE_URL);

    expect(result).toEqual([]);
  });

  it("lists closed Matches most recently ended first, with player counts", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    const [older, newer] = await db
      .insert(matches)
      .values([
        {
          serverId: server.id,
          map: "Foundry",
          experiences: ["Frontline"],
          startedAt: new Date("2026-01-01T00:00:00.000Z"),
          endedAt: new Date("2026-01-01T00:30:00.000Z"),
        },
        {
          serverId: server.id,
          map: "Sandstorm",
          experiences: ["Skirmish"],
          startedAt: new Date("2026-01-02T00:00:00.000Z"),
          endedAt: new Date("2026-01-02T00:20:00.000Z"),
        },
      ])
      .returning();

    await db.insert(playerMatchStats).values([
      {
        matchId: older.id,
        steamId: "1",
        faction: "Lonestar",
        kills: 5,
        deaths: 2,
        cash: 100,
      },
      {
        matchId: older.id,
        steamId: "2",
        faction: "Valkyra",
        kills: 3,
        deaths: 4,
        cash: 50,
      },
      {
        matchId: newer.id,
        steamId: "1",
        faction: "Lonestar",
        kills: 1,
        deaths: 1,
        cash: 10,
      },
    ]);

    const result = await getRecentMatches(db, BASE_URL);

    expect(result).toEqual([
      {
        id: newer.id,
        map: "Sandstorm",
        experiences: ["Skirmish"],
        startedAt: "2026-01-02T00:00:00.000Z",
        endedAt: "2026-01-02T00:20:00.000Z",
        playerCount: 1,
      },
      {
        id: older.id,
        map: "Foundry",
        experiences: ["Frontline"],
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:30:00.000Z",
        playerCount: 2,
      },
    ]);
  });

  it("excludes the currently open Match", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(matches).values([
      {
        serverId: server.id,
        map: "Foundry",
        experiences: ["Frontline"],
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        endedAt: new Date("2026-01-01T00:30:00.000Z"),
      },
      {
        serverId: server.id,
        map: "Sandstorm",
        experiences: ["Skirmish"],
        startedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    ]);

    const result = await getRecentMatches(db, BASE_URL);

    expect(result.map((match) => match.map)).toEqual(["Foundry"]);
  });
});

describe("getPlayerMatchHistory", () => {
  it("returns an empty list when the Server isn't seeded", async () => {
    const result = await getPlayerMatchHistory(db, BASE_URL, "1");

    expect(result).toEqual([]);
  });

  it("lists only the requested player's closed Matches, most recent first", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    const [older, newer, open] = await db
      .insert(matches)
      .values([
        {
          serverId: server.id,
          map: "Foundry",
          experiences: ["Frontline"],
          startedAt: new Date("2026-01-01T00:00:00.000Z"),
          endedAt: new Date("2026-01-01T00:30:00.000Z"),
        },
        {
          serverId: server.id,
          map: "Sandstorm",
          experiences: ["Skirmish"],
          startedAt: new Date("2026-01-02T00:00:00.000Z"),
          endedAt: new Date("2026-01-02T00:20:00.000Z"),
        },
        {
          serverId: server.id,
          map: "Open Map",
          experiences: ["Skirmish"],
          startedAt: new Date("2026-01-03T00:00:00.000Z"),
        },
      ])
      .returning();

    await db.insert(playerMatchStats).values([
      {
        matchId: older.id,
        steamId: "1",
        faction: "Lonestar",
        kills: 10,
        deaths: 4,
        cash: 100,
      },
      {
        matchId: newer.id,
        steamId: "1",
        faction: "Valkyra",
        kills: 6,
        deaths: 0,
        cash: 40,
      },
      {
        matchId: newer.id,
        steamId: "2",
        faction: "Lonestar",
        kills: 2,
        deaths: 2,
        cash: 20,
      },
      {
        matchId: open.id,
        steamId: "1",
        faction: "Lonestar",
        kills: 1,
        deaths: 1,
        cash: 5,
      },
    ]);

    const result = await getPlayerMatchHistory(db, BASE_URL, "1");

    expect(result).toEqual([
      {
        matchId: newer.id,
        map: "Sandstorm",
        experiences: ["Skirmish"],
        startedAt: "2026-01-02T00:00:00.000Z",
        endedAt: "2026-01-02T00:20:00.000Z",
        faction: "Valkyra",
        kills: 6,
        deaths: 0,
        kd: 6,
        cash: 40,
      },
      {
        matchId: older.id,
        map: "Foundry",
        experiences: ["Frontline"],
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:30:00.000Z",
        faction: "Lonestar",
        kills: 10,
        deaths: 4,
        kd: 2.5,
        cash: 100,
      },
    ]);
  });
});

describe("getMatchDetail", () => {
  it("returns null when the Server isn't seeded", async () => {
    const result = await getMatchDetail(db, BASE_URL, 1);

    expect(result).toBeNull();
  });

  it("returns null when the Match is still open", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    const [open] = await db
      .insert(matches)
      .values({
        serverId: server.id,
        map: "Foundry",
        experiences: ["Frontline"],
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
      })
      .returning();

    const result = await getMatchDetail(db, BASE_URL, open.id);

    expect(result).toBeNull();
  });

  it("returns the winning Faction, totals, and per-player stats, most kills first", async () => {
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
      })
      .returning();

    await db.insert(playerCareerStats).values([
      {
        serverId: server.id,
        steamId: "1",
        displayName: "Alice",
        kills: 5,
        deaths: 2,
        cash: 100,
        matchesPlayed: 1,
      },
      {
        serverId: server.id,
        steamId: "2",
        displayName: "Bob",
        kills: 3,
        deaths: 4,
        cash: 50,
        matchesPlayed: 1,
      },
    ]);

    await db.insert(playerMatchStats).values([
      {
        matchId: match.id,
        steamId: "1",
        faction: "Lonestar",
        kills: 5,
        deaths: 2,
        cash: 100,
      },
      {
        matchId: match.id,
        steamId: "2",
        faction: "Valkyra",
        kills: 3,
        deaths: 4,
        cash: 50,
      },
    ]);

    const result = await getMatchDetail(db, BASE_URL, match.id);

    expect(result).toEqual({
      id: match.id,
      map: "Foundry",
      experiences: ["Frontline"],
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:30:00.000Z",
      winningFaction: "Lonestar",
      totalKills: 8,
      totalDeaths: 6,
      totalCash: 150,
      players: [
        {
          steamId: "1",
          displayName: "Alice",
          faction: "Lonestar",
          kills: 5,
          deaths: 2,
          kd: 2.5,
          cash: 100,
          avatarUrl: null,
        },
        {
          steamId: "2",
          displayName: "Bob",
          faction: "Valkyra",
          kills: 3,
          deaths: 4,
          kd: 0.75,
          cash: 50,
          avatarUrl: null,
        },
      ],
    });
  });

  it("falls back to the steamId when no displayName is known", async () => {
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
      })
      .returning();

    await db.insert(playerMatchStats).values({
      matchId: match.id,
      steamId: "99",
      faction: "Lonestar",
      kills: 1,
      deaths: 1,
      cash: 5,
    });

    const result = await getMatchDetail(db, BASE_URL, match.id);

    expect(result?.players[0].displayName).toBe("99");
    expect(result?.winningFaction).toBeNull();
  });
});
