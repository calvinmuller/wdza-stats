import {
  createDb,
  gameEvents,
  matches,
  playerCareerStats,
  playerMatchStats,
  servers,
  type Database,
} from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  getMatchDetail,
  getMatchesPage,
  getPlayerMatchHistory,
  MATCHES_PAGE_SIZE,
  parseMatchesPage,
} from "./match-history";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = "http://match-history.test:9006";

afterEach(async () => {
  await db.delete(gameEvents);
  await db.delete(playerMatchStats);
  await db.delete(playerCareerStats);
  await db.delete(matches);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

describe("getMatchesPage", () => {
  it("returns an empty page when the Server isn't seeded", async () => {
    const result = await getMatchesPage(db, BASE_URL);

    expect(result).toEqual({ page: 1, pageSize: MATCHES_PAGE_SIZE, totalCount: 0, totalPages: 0, rows: [] });
  });

  it("returns an empty page when the Server has no closed Matches", async () => {
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

    const result = await getMatchesPage(db, BASE_URL);

    expect(result.rows).toEqual([]);
  });

  it("lists closed Matches most recently ended first, with player counts, winner, and MVP", async () => {
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
          winningFaction: "Lonestar",
          mvpPlayerSteamId: "1",
          mvpScore: 40,
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

    await db.insert(playerCareerStats).values({
      serverId: server.id,
      steamId: "1",
      displayName: "Alice",
      matchesPlayed: 2,
    });

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

    const result = await getMatchesPage(db, BASE_URL);

    expect(result.page).toBe(1);
    expect(result.totalCount).toBe(2);
    expect(result.totalPages).toBe(1);
    expect(result.rows).toEqual([
      {
        id: newer.id,
        map: "Sandstorm",
        experiences: ["Skirmish"],
        startedAt: "2026-01-02T00:00:00.000Z",
        endedAt: "2026-01-02T00:20:00.000Z",
        playerCount: 1,
        winningFaction: null,
        mvpPlayerSteamId: null,
        mvpDisplayName: null,
      },
      {
        id: older.id,
        map: "Foundry",
        experiences: ["Frontline"],
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:30:00.000Z",
        playerCount: 2,
        winningFaction: "Lonestar",
        mvpPlayerSteamId: "1",
        mvpDisplayName: "Alice",
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

    const result = await getMatchesPage(db, BASE_URL);

    expect(result.rows.map((match) => match.map)).toEqual(["Foundry"]);
  });

  it("paginates correctly across pages", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(matches).values(
      Array.from({ length: MATCHES_PAGE_SIZE + 5 }, (_, index) => ({
        serverId: server.id,
        map: `Map ${index}`,
        experiences: ["Frontline"],
        startedAt: new Date(Date.UTC(2026, 0, index + 1, 0, 0, 0)),
        endedAt: new Date(Date.UTC(2026, 0, index + 1, 0, 30, 0)),
      })),
    );

    const firstPage = await getMatchesPage(db, BASE_URL, 1);

    expect(firstPage.totalCount).toBe(MATCHES_PAGE_SIZE + 5);
    expect(firstPage.totalPages).toBe(2);
    expect(firstPage.rows).toHaveLength(MATCHES_PAGE_SIZE);
    // Most recently ended first, so page 1's last row is "Map 5", the 5th
    // oldest of the 30 seeded Matches.
    expect(firstPage.rows[0].map).toBe(`Map ${MATCHES_PAGE_SIZE + 4}`);
    expect(firstPage.rows[MATCHES_PAGE_SIZE - 1].map).toBe("Map 5");

    const secondPage = await getMatchesPage(db, BASE_URL, 2);

    expect(secondPage.totalCount).toBe(MATCHES_PAGE_SIZE + 5);
    expect(secondPage.totalPages).toBe(2);
    expect(secondPage.rows).toHaveLength(5);
    expect(secondPage.rows.map((match) => match.map)).toEqual([
      "Map 4",
      "Map 3",
      "Map 2",
      "Map 1",
      "Map 0",
    ]);
  });

  it("falls back to an empty page for a page number beyond the last", async () => {
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

    const result = await getMatchesPage(db, BASE_URL, 5);

    expect(result).toEqual({ page: 5, pageSize: MATCHES_PAGE_SIZE, totalCount: 1, totalPages: 1, rows: [] });
  });
});

describe("parseMatchesPage", () => {
  it("defaults to page 1 for missing, non-numeric, or non-positive input", () => {
    expect(parseMatchesPage(null)).toBe(1);
    expect(parseMatchesPage(undefined)).toBe(1);
    expect(parseMatchesPage("bogus")).toBe(1);
    expect(parseMatchesPage("0")).toBe(1);
    expect(parseMatchesPage("-1")).toBe(1);
  });

  it("parses a valid page number", () => {
    expect(parseMatchesPage("3")).toBe(3);
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

  it("returns the winning Faction, MVP, totals, and per-player stats, most kills first", async () => {
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
      mvpPlayerSteamId: "1",
      mvpDisplayName: "Alice",
      mvpScore: 40,
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
          countryCode: null,
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
          countryCode: null,
        },
      ],
      firstBlood: null,
    });
  });

  it("falls back to the steamId when no displayName is known, including for the MVP", async () => {
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
        mvpPlayerSteamId: "99",
        mvpScore: 10,
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
    expect(result?.mvpDisplayName).toBe("99");
  });

  it("has no MVP when the Match closed without one", async () => {
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

    const result = await getMatchDetail(db, BASE_URL, match.id);

    expect(result?.mvpPlayerSteamId).toBeNull();
    expect(result?.mvpDisplayName).toBeNull();
    expect(result?.mvpScore).toBeNull();
  });

  it("names the killer and victim of the Match's first kill when the earliest poll has exactly one of each", async () => {
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

    await db.insert(playerCareerStats).values([
      { serverId: server.id, steamId: "1", displayName: "Alice", kills: 1, deaths: 0, cash: 0, matchesPlayed: 1 },
      { serverId: server.id, steamId: "2", displayName: "Bob", kills: 0, deaths: 1, cash: 0, matchesPlayed: 1 },
    ]);

    await db.insert(playerMatchStats).values([
      { matchId: match.id, steamId: "1", faction: "Lonestar", kills: 1, deaths: 0, cash: 0 },
      { matchId: match.id, steamId: "2", faction: "Valkyra", kills: 0, deaths: 1, cash: 0 },
    ]);

    const firstPollAt = new Date("2026-01-01T00:00:15.000Z");
    await db.insert(gameEvents).values([
      {
        serverId: server.id,
        matchId: match.id,
        type: "PlayerKilled",
        timestamp: firstPollAt,
        steamId: "1",
        sourceSnapshotId: 1,
        idempotencyKey: `${match.id}:PlayerKilled:1:1`,
      },
      {
        serverId: server.id,
        matchId: match.id,
        type: "PlayerDeath",
        timestamp: firstPollAt,
        steamId: "2",
        sourceSnapshotId: 1,
        idempotencyKey: `${match.id}:PlayerDeath:2:1`,
      },
    ]);

    const result = await getMatchDetail(db, BASE_URL, match.id);

    expect(result?.firstBlood).toEqual({
      killerSteamId: "1",
      killerDisplayName: "Alice",
      victimSteamId: "2",
      victimDisplayName: "Bob",
    });
  });

  it("names only the killer, with no victim, when the earliest poll has more than one death", async () => {
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

    await db.insert(playerCareerStats).values([
      { serverId: server.id, steamId: "1", displayName: "Alice", kills: 2, deaths: 0, cash: 0, matchesPlayed: 1 },
      { serverId: server.id, steamId: "2", displayName: "Bob", kills: 0, deaths: 1, cash: 0, matchesPlayed: 1 },
      { serverId: server.id, steamId: "3", displayName: "Carol", kills: 0, deaths: 1, cash: 0, matchesPlayed: 1 },
    ]);

    await db.insert(playerMatchStats).values([
      { matchId: match.id, steamId: "1", faction: "Lonestar", kills: 2, deaths: 0, cash: 0 },
      { matchId: match.id, steamId: "2", faction: "Valkyra", kills: 0, deaths: 1, cash: 0 },
      { matchId: match.id, steamId: "3", faction: "Valkyra", kills: 0, deaths: 1, cash: 0 },
    ]);

    const firstPollAt = new Date("2026-01-01T00:00:15.000Z");
    await db.insert(gameEvents).values([
      {
        serverId: server.id,
        matchId: match.id,
        type: "PlayerKilled",
        timestamp: firstPollAt,
        steamId: "1",
        sourceSnapshotId: 1,
        idempotencyKey: `${match.id}:PlayerKilled:1:1`,
      },
      {
        serverId: server.id,
        matchId: match.id,
        type: "PlayerDeath",
        timestamp: firstPollAt,
        steamId: "2",
        sourceSnapshotId: 1,
        idempotencyKey: `${match.id}:PlayerDeath:2:1`,
      },
      {
        serverId: server.id,
        matchId: match.id,
        type: "PlayerDeath",
        timestamp: firstPollAt,
        steamId: "3",
        sourceSnapshotId: 1,
        idempotencyKey: `${match.id}:PlayerDeath:3:1`,
      },
    ]);

    const result = await getMatchDetail(db, BASE_URL, match.id);

    expect(result?.firstBlood).toEqual({
      killerSteamId: "1",
      killerDisplayName: "Alice",
      victimSteamId: null,
      victimDisplayName: null,
    });
  });

  it("shows no first blood when the earliest poll's kills are split across more than one player", async () => {
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

    await db.insert(playerMatchStats).values([
      { matchId: match.id, steamId: "1", faction: "Lonestar", kills: 1, deaths: 0, cash: 0 },
      { matchId: match.id, steamId: "2", faction: "Valkyra", kills: 1, deaths: 0, cash: 0 },
    ]);

    const firstPollAt = new Date("2026-01-01T00:00:15.000Z");
    await db.insert(gameEvents).values([
      {
        serverId: server.id,
        matchId: match.id,
        type: "PlayerKilled",
        timestamp: firstPollAt,
        steamId: "1",
        sourceSnapshotId: 1,
        idempotencyKey: `${match.id}:PlayerKilled:1:1`,
      },
      {
        serverId: server.id,
        matchId: match.id,
        type: "PlayerKilled",
        timestamp: firstPollAt,
        steamId: "2",
        sourceSnapshotId: 1,
        idempotencyKey: `${match.id}:PlayerKilled:2:1`,
      },
    ]);

    const result = await getMatchDetail(db, BASE_URL, match.id);

    expect(result?.firstBlood).toBeNull();
  });
});
