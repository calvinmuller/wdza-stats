import {
  challengeCompletions,
  challengeDefinitions,
  challengeInstances,
  createDb,
  gameEvents,
  latestSnapshots,
  matchSnapshots,
  matches,
  notifications,
  notificationSettings,
  playerAchievements,
  playerCareerStats,
  playerChallengeProgress,
  playerMatchStats,
  servers,
  xpTransactions,
  type ChallengeType,
  type Database,
  type Snapshot,
  type SnapshotPlayer,
} from "@wdza-stats/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  applyAchievementUnlockDrafts,
  applyXpTransactionDrafts,
  closeMatch,
  computePlayerDeltas,
  detectMatchBoundary,
  winningFaction,
} from "./match-tracker";
import { playersFixture, scriptedRconClient, statusFixture } from "./rcon-fixture";
import { pollAndPersistSnapshot } from "./snapshot-poller";

function player(overrides: Partial<SnapshotPlayer> = {}): SnapshotPlayer {
  return {
    steamId: "1",
    displayName: "Alice",
    faction: "Lonestar",
    kills: 0,
    deaths: 0,
    cash: 0,
    ping: 40,
    ...overrides,
  };
}

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    map: "Sandstorm",
    lighting: "Day",
    alternator: "None",
    experiences: ["TeamDeathmatch"],
    rotation: { nowIndex: 0, entries: [{ map: "Sandstorm" }] },
    factions: [],
    players: [],
    playerSlots: { current: 0, max: 100 },
    ...overrides,
  };
}

describe("detectMatchBoundary", () => {
  it("is false when nothing meaningful changed", () => {
    const previous = snapshot({ players: [player({ kills: 3 })] });
    const next = snapshot({ players: [player({ kills: 5 })] });

    expect(detectMatchBoundary(previous, next)).toBe(false);
  });

  it("is true when the map changes", () => {
    const previous = snapshot({ map: "Sandstorm" });
    const next = snapshot({ map: "Deadcity" });

    expect(detectMatchBoundary(previous, next)).toBe(true);
  });

  it("is true when rotation.nowIndex changes", () => {
    const previous = snapshot({ rotation: { nowIndex: 0, entries: [] } });
    const next = snapshot({ rotation: { nowIndex: 1, entries: [] } });

    expect(detectMatchBoundary(previous, next)).toBe(true);
  });

  it("is true when a player's kills drop below their prior value", () => {
    const previous = snapshot({ players: [player({ kills: 5 })] });
    const next = snapshot({ players: [player({ kills: 0 })] });

    expect(detectMatchBoundary(previous, next)).toBe(true);
  });

  it("is true when a player's deaths drop below their prior value", () => {
    const previous = snapshot({ players: [player({ deaths: 5 })] });
    const next = snapshot({ players: [player({ deaths: 2 })] });

    expect(detectMatchBoundary(previous, next)).toBe(true);
  });

  it("is true when a player's cash drops below their prior value", () => {
    const previous = snapshot({ players: [player({ cash: 500 })] });
    const next = snapshot({ players: [player({ cash: 100 })] });

    expect(detectMatchBoundary(previous, next)).toBe(true);
  });

  it("is false when lighting changes alone", () => {
    const previous = snapshot({ lighting: "Day" });
    const next = snapshot({ lighting: "Night" });

    expect(detectMatchBoundary(previous, next)).toBe(false);
  });

  it("is false when alternator changes alone", () => {
    const previous = snapshot({ alternator: "None" });
    const next = snapshot({ alternator: "Active" });

    expect(detectMatchBoundary(previous, next)).toBe(false);
  });

  it("is false for a newly-joined player with no prior value to compare", () => {
    const previous = snapshot({ players: [] });
    const next = snapshot({ players: [player({ steamId: "2", kills: 3 })] });

    expect(detectMatchBoundary(previous, next)).toBe(false);
  });
});

describe("winningFaction", () => {
  it("is the Faction with the highest score", () => {
    const finalSnapshot = snapshot({
      factions: [
        { name: "Lonestar", color: "#ff0000", score: 100 },
        { name: "Valkyra", color: "#0000ff", score: 82 },
      ],
    });

    expect(winningFaction(finalSnapshot)).toBe("Lonestar");
  });

  it("is null when the final Snapshot recorded no Factions", () => {
    expect(winningFaction(snapshot({ factions: [] }))).toBeNull();
  });

  it("is null when the top score is tied - a tie never wins, matching FactionTookLead's strict-overtake rule", () => {
    const finalSnapshot = snapshot({
      factions: [
        { name: "Lonestar", color: "#ff0000", score: 50 },
        { name: "Valkyra", color: "#0000ff", score: 50 },
      ],
    });

    expect(winningFaction(finalSnapshot)).toBeNull();
  });
});

describe("computePlayerDeltas", () => {
  it("computes kills/deaths/cash delta between a player's first and last Snapshot", () => {
    const snapshots = [
      snapshot({ players: [player({ kills: 1, deaths: 0, cash: 100 })] }),
      snapshot({ players: [player({ kills: 4, deaths: 1, cash: 350 })] }),
    ];

    expect(computePlayerDeltas(snapshots)).toEqual([
      {
        steamId: "1",
        displayName: "Alice",
        faction: "Lonestar",
        kills: 3,
        deaths: 1,
        cash: 250,
      },
    ]);
  });

  it("attributes the Faction observed at the player's last Snapshot", () => {
    const snapshots = [
      snapshot({ players: [player({ faction: "Lonestar" })] }),
      snapshot({ players: [player({ faction: "Valkyra" })] }),
    ];

    expect(computePlayerDeltas(snapshots)[0]).toMatchObject({
      faction: "Valkyra",
    });
  });

  it("includes a zero-delta row for a player observed in only one Snapshot", () => {
    const snapshots = [
      snapshot({
        players: [
          player({ steamId: "1", kills: 2 }),
          player({ steamId: "2", kills: 9 }),
        ],
      }),
      snapshot({ players: [player({ steamId: "1", kills: 5 })] }),
    ];

    const deltas = computePlayerDeltas(snapshots);
    expect(deltas).toHaveLength(2);
    expect(deltas.find((d) => d.steamId === "2")).toMatchObject({
      kills: 0,
      deaths: 0,
      cash: 0,
    });
  });

  it("returns an empty array for a Match window with no player observations", () => {
    expect(computePlayerDeltas([snapshot({ players: [] })])).toEqual([]);
  });
});

// Integration: runs the real ingestion pipeline (pollAndPersistSnapshot ->
// ingestSnapshot) against a real test Postgres database and asserts on the
// resulting Match, PlayerMatchStat, and PlayerCareerStat rows - see spec.md
// "Worker seam".
describe("Match-boundary detection and persistence (integration)", () => {
  const db: Database = createDb(process.env.DATABASE_URL!);

  async function seedServer() {
    const [server] = await db
      .insert(servers)
      .values({
        name: "Test Server",
        baseUrl: `http://rcon-match-tracker-${crypto.randomUUID()}.test:9006`,
      })
      .returning();
    return server;
  }

  async function closedMatchesFor(serverId: number) {
    return db
      .select()
      .from(matches)
      .where(and(eq(matches.serverId, serverId), isNotNull(matches.endedAt)));
  }

  afterEach(async () => {
    await db.delete(challengeCompletions);
    await db.delete(playerChallengeProgress);
    await db.delete(playerAchievements);
    await db.delete(xpTransactions);
    await db.delete(notifications);
    await db.delete(gameEvents);
    await db.delete(challengeInstances);
    await db.delete(playerMatchStats);
    await db.delete(playerCareerStats);
    await db.delete(matchSnapshots);
    await db.delete(matches);
    await db.delete(latestSnapshots);
    await db.delete(servers);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("keeps a single Match open across Snapshots with no boundary signal", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture(),
        players: playersFixture([
          {
            steamId: "1",
            name: "Alice",
            faction: "Lonestar",
            kills: 1,
            deaths: 0,
            cash: 100,
            pingMs: 40,
          },
        ]),
      },
      {
        // lighting/alternator changing alone must not trigger a boundary
        status: statusFixture({ lighting: "Night", alternator: "Active" }),
        players: playersFixture([
          {
            steamId: "1",
            name: "Alice",
            faction: "Lonestar",
            kills: 4,
            deaths: 1,
            cash: 250,
            pingMs: 40,
          },
        ]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);

    const rows = await db
      .select()
      .from(matches)
      .where(eq(matches.serverId, server.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].endedAt).toBeNull();
    expect(await db.select().from(playerMatchStats)).toHaveLength(0);
  });

  it("attributes a mid-Match Faction switch to the Faction at the player's last Snapshot", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture(),
        players: playersFixture([
          {
            steamId: "1",
            name: "Alice",
            faction: "Lonestar",
            kills: 1,
            deaths: 0,
            cash: 100,
            pingMs: 40,
          },
        ]),
      },
      {
        status: statusFixture(),
        players: playersFixture([
          {
            steamId: "1",
            name: "Alice",
            faction: "Valkyra",
            kills: 3,
            deaths: 1,
            cash: 300,
            pingMs: 40,
          },
        ]),
      },
      {
        // map change closes the Match started above
        status: statusFixture({ map: "Deadcity" }),
        players: playersFixture([]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);

    const [closed] = await closedMatchesFor(server.id);
    expect(closed).toBeDefined();
    // statusFixture()'s default factionScores lead with Lonestar 10 - Valkyra 8.
    expect(closed.winningFaction).toBe("Lonestar");

    const stats = await db
      .select()
      .from(playerMatchStats)
      .where(eq(playerMatchStats.matchId, closed.id));
    expect(stats).toEqual([
      {
        matchId: closed.id,
        steamId: "1",
        faction: "Valkyra",
        kills: 2,
        deaths: 1,
        cash: 200,
      },
    ]);
  });

  it("closes the Match on a same-map counter reset and opens a new one, deleting the closed Match's raw Snapshots", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture(),
        players: playersFixture([
          {
            steamId: "1",
            name: "Alice",
            faction: "Lonestar",
            kills: 5,
            deaths: 1,
            cash: 400,
            pingMs: 40,
          },
        ]),
      },
      {
        // still climbing within the same Match - not a boundary
        status: statusFixture(),
        players: playersFixture([
          {
            steamId: "1",
            name: "Alice",
            faction: "Lonestar",
            kills: 8,
            deaths: 2,
            cash: 900,
            pingMs: 40,
          },
        ]),
      },
      {
        // same map, same rotation, but counters reset - a same-map restart
        status: statusFixture(),
        players: playersFixture([
          {
            steamId: "1",
            name: "Alice",
            faction: "Lonestar",
            kills: 0,
            deaths: 0,
            cash: 0,
            pingMs: 40,
          },
        ]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    const [firstMatch] = await db
      .select()
      .from(matches)
      .where(eq(matches.serverId, server.id));

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);

    const rows = await db
      .select()
      .from(matches)
      .where(eq(matches.serverId, server.id));
    expect(rows).toHaveLength(2);

    const closed = rows.find((row) => row.id === firstMatch.id)!;
    expect(closed.endedAt).not.toBeNull();
    const stats = await db
      .select()
      .from(playerMatchStats)
      .where(eq(playerMatchStats.matchId, closed.id));
    expect(stats).toEqual([
      { matchId: closed.id, steamId: "1", faction: "Lonestar", kills: 3, deaths: 1, cash: 500 },
    ]);

    const career = await db
      .select()
      .from(playerCareerStats)
      .where(eq(playerCareerStats.steamId, "1"));
    expect(career[0]).toMatchObject({
      kills: 3,
      deaths: 1,
      cash: 500,
      matchesPlayed: 1,
    });

    // The closed Match's raw Snapshots are gone; the new open Match retains its own.
    const closedMatchSnapshots = await db
      .select()
      .from(matchSnapshots)
      .where(eq(matchSnapshots.matchId, closed.id));
    expect(closedMatchSnapshots).toHaveLength(0);

    const openMatch = rows.find((row) => row.id !== firstMatch.id)!;
    const openMatchSnapshots = await db
      .select()
      .from(matchSnapshots)
      .where(eq(matchSnapshots.matchId, openMatch.id));
    expect(openMatchSnapshots).toHaveLength(1);
  });

  it("logs when a Match starts, and again when it closes", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 5, deaths: 1, cash: 400, pingMs: 40 },
        ]),
      },
      {
        // same map, counters reset - closes the first Match, opens a second
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    const [firstMatch] = await db.select().from(matches).where(eq(matches.serverId, server.id));
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(`[worker] match started: matchId=${firstMatch.id}, map=Sandstorm`),
    );

    logSpy.mockClear();
    await pollAndPersistSnapshot(db, client, server.id);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(`[worker] match closed: matchId=${firstMatch.id}, winner=`),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[worker] match started:"));

    logSpy.mockRestore();
  });

  it("accumulates PlayerCareerStat totals across multiple closed Matches, updating displayName to the latest observed name", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        // Match 1 begins
        status: statusFixture({ map: "Sandstorm" }),
        players: playersFixture([
          {
            steamId: "1",
            name: "Alice",
            faction: "Lonestar",
            kills: 1,
            deaths: 0,
            cash: 100,
            pingMs: 40,
          },
        ]),
      },
      {
        // still Match 1 - no boundary
        status: statusFixture({ map: "Sandstorm" }),
        players: playersFixture([
          {
            steamId: "1",
            name: "Alice",
            faction: "Lonestar",
            kills: 4,
            deaths: 1,
            cash: 350,
            pingMs: 40,
          },
        ]),
      },
      {
        // map change closes Match 1, opens Match 2 with a renamed player
        status: statusFixture({ map: "Deadcity" }),
        players: playersFixture([
          {
            steamId: "1",
            name: "AliceRenamed",
            faction: "Lonestar",
            kills: 0,
            deaths: 0,
            cash: 0,
            pingMs: 40,
          },
        ]),
      },
      {
        // still Match 2 - no boundary
        status: statusFixture({ map: "Deadcity" }),
        players: playersFixture([
          {
            steamId: "1",
            name: "AliceRenamed",
            faction: "Lonestar",
            kills: 2,
            deaths: 0,
            cash: 50,
            pingMs: 40,
          },
        ]),
      },
      {
        // map change closes Match 2
        status: statusFixture({ map: "Sandstorm" }),
        players: playersFixture([]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id); // Match 1 opens
    await pollAndPersistSnapshot(db, client, server.id); // still Match 1
    await pollAndPersistSnapshot(db, client, server.id); // closes Match 1, opens Match 2
    await pollAndPersistSnapshot(db, client, server.id); // still Match 2
    await pollAndPersistSnapshot(db, client, server.id); // closes Match 2

    const closed = await closedMatchesFor(server.id);
    expect(closed).toHaveLength(2);

    const career = await db
      .select()
      .from(playerCareerStats)
      .where(eq(playerCareerStats.steamId, "1"));
    expect(career).toHaveLength(1);
    expect(career[0]).toMatchObject({
      serverId: server.id,
      steamId: "1",
      displayName: "AliceRenamed",
      kills: 5,
      deaths: 1,
      cash: 300,
      matchesPlayed: 2,
    });
  });

  it("closes the Match on a map/rotation change and opens a new one", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture({
          map: "Sandstorm",
          rotation: { nowIndex: 0, entries: [{ map: "Sandstorm" }, { map: "Deadcity" }] },
        }),
        players: playersFixture([]),
      },
      {
        status: statusFixture({
          map: "Sandstorm",
          rotation: { nowIndex: 1, entries: [{ map: "Sandstorm" }, { map: "Deadcity" }] },
        }),
        players: playersFixture([]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);

    const rows = await db
      .select()
      .from(matches)
      .where(eq(matches.serverId, server.id));
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.endedAt !== null)).toHaveLength(1);
  });

  it("closes a stale Match using the last-known-good Snapshot after a simulated polling gap", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture({ map: "Sandstorm" }),
        players: playersFixture([
          {
            steamId: "1",
            name: "Alice",
            faction: "Lonestar",
            kills: 5,
            deaths: 2,
            cash: 400,
            pingMs: 40,
          },
        ]),
      },
      {
        // A completely different game state, as if the Worker missed an
        // arbitrary stretch of polls: different map and reset counters.
        status: statusFixture({ map: "Deadcity" }),
        players: playersFixture([
          {
            steamId: "2",
            name: "Bob",
            faction: "Valkyra",
            kills: 0,
            deaths: 0,
            cash: 0,
            pingMs: 40,
          },
        ]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    const [lastKnownGood] = await db
      .select()
      .from(latestSnapshots)
      .where(eq(latestSnapshots.serverId, server.id));

    // The gap itself is just time passing with no polls in between - the
    // Worker has no special "resume" step, it just polls again.
    await pollAndPersistSnapshot(db, client, server.id);

    const [closed] = await closedMatchesFor(server.id);
    expect(closed).toBeDefined();
    expect(closed.endedAt).toEqual(lastKnownGood.capturedAt);

    const stats = await db
      .select()
      .from(playerMatchStats)
      .where(eq(playerMatchStats.matchId, closed.id));
    expect(stats).toEqual([
      { matchId: closed.id, steamId: "1", faction: "Lonestar", kills: 0, deaths: 0, cash: 0 },
    ]);
  });
});

// Integration: runs the real ingestion pipeline against a real test
// Postgres database and asserts on the resulting xp_transactions ledger and
// playerCareerStats.xp cache - see ticket 05.
describe("XP ledger and awards (integration)", () => {
  const db: Database = createDb(process.env.DATABASE_URL!);

  async function seedServer() {
    const [server] = await db
      .insert(servers)
      .values({
        name: "Test Server",
        baseUrl: `http://rcon-xp-engine-${crypto.randomUUID()}.test:9006`,
      })
      .returning();
    return server;
  }

  async function transactionsFor(steamId: string) {
    return db.select().from(xpTransactions).where(eq(xpTransactions.steamId, steamId));
  }

  async function careerStatsFor(serverId: number, steamId: string) {
    const [row] = await db
      .select()
      .from(playerCareerStats)
      .where(and(eq(playerCareerStats.serverId, serverId), eq(playerCareerStats.steamId, steamId)));
    return row;
  }

  afterEach(async () => {
    await db.delete(challengeCompletions);
    await db.delete(playerChallengeProgress);
    await db.delete(playerAchievements);
    await db.delete(xpTransactions);
    await db.delete(notifications);
    await db.delete(gameEvents);
    await db.delete(challengeInstances);
    await db.delete(playerMatchStats);
    await db.delete(playerCareerStats);
    await db.delete(matchSnapshots);
    await db.delete(matches);
    await db.delete(latestSnapshots);
    await db.delete(servers);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("awards the configured kill and first_blood amounts for a Match's opening kill", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
      {
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 1, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);

    const transactions = await transactionsFor("1");
    expect(transactions.map((t) => ({ reason: t.reason, amount: t.amount }))).toEqual(
      expect.arrayContaining([
        { reason: "kill", amount: 100 },
        { reason: "first_blood", amount: 100 },
      ]),
    );
    expect(transactions).toHaveLength(2);

    const career = await careerStatsFor(server.id, "1");
    expect(career.xp).toBe(200);
  });

  it("awards first_blood only to a Match's actual first kill, not a later one", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
          { steamId: "2", name: "Bob", faction: "Valkyra", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
      {
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 1, deaths: 0, cash: 0, pingMs: 40 },
          { steamId: "2", name: "Bob", faction: "Valkyra", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
      {
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 1, deaths: 0, cash: 0, pingMs: 40 },
          { steamId: "2", name: "Bob", faction: "Valkyra", kills: 1, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);

    const aliceTransactions = await transactionsFor("1");
    expect(aliceTransactions.map((t) => t.reason)).toEqual(expect.arrayContaining(["kill", "first_blood"]));

    const bobTransactions = await transactionsFor("2");
    expect(bobTransactions.map((t) => t.reason)).toEqual(["kill"]);
  });

  it("fires each kill-streak milestone exactly once as a streak climbs past it", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
      {
        // Ten kills in one poll - streak climbs 1 through 10.
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 10, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);

    const transactions = await transactionsFor("1");
    const milestoneReasons = transactions.map((t) => t.reason).filter((reason) => reason.startsWith("streak"));
    expect(milestoneReasons.sort()).toEqual(["streak10", "streak3", "streak5"]);

    const kills = transactions.filter((t) => t.reason === "kill");
    expect(kills).toHaveLength(10);

    const career = await careerStatsFor(server.id, "1");
    const ledgerTotal = transactions.reduce((sum, t) => sum + t.amount, 0);
    expect(career.xp).toBe(ledgerTotal);
    // 10 kills (1000) + first_blood (100) + streak3/5/10 (150+250+500=900) =
    // 2000, plus the seeded daily Challenges this same streak also completes:
    // kill_streak (target 5, +350), kills_without_dying (target 8, +400), and
    // kills_in_match (target 10, +400) - see ticket 09.
    expect(career.xp).toBe(3150);
  });

  it("awards match_completed to every participant and match_win only to the winning Faction, when a Match closes", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture({ map: "Sandstorm" }),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
          { steamId: "2", name: "Bob", faction: "Valkyra", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
      {
        // map change closes the Match - statusFixture()'s default scores lead with Lonestar 10-8.
        status: statusFixture({ map: "Deadcity" }),
        players: playersFixture([]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);

    const aliceTransactions = await transactionsFor("1");
    expect(aliceTransactions.map((t) => ({ reason: t.reason, amount: t.amount }))).toEqual(
      expect.arrayContaining([
        { reason: "match_completed", amount: 250 },
        { reason: "match_win", amount: 500 },
      ]),
    );

    const bobTransactions = await transactionsFor("2");
    expect(bobTransactions.map((t) => t.reason)).toEqual(["match_completed"]);

    const aliceCareer = await careerStatsFor(server.id, "1");
    expect(aliceCareer.xp).toBe(750);
    const bobCareer = await careerStatsFor(server.id, "2");
    expect(bobCareer.xp).toBe(250);
  });

  it("never double-awards XP for the same GameEvent and reason, even if applied twice (reprocessing safety)", async () => {
    const server = await seedServer();
    const [match] = await db
      .insert(matches)
      .values({ serverId: server.id, map: "Sandstorm", experiences: ["TeamDeathmatch"], startedAt: new Date() })
      .returning();
    const [event] = await db
      .insert(gameEvents)
      .values({
        serverId: server.id,
        matchId: match.id,
        type: "PlayerKilled",
        timestamp: new Date(),
        steamId: "1",
        idempotencyKey: `reprocess-test-${crypto.randomUUID()}`,
        sourceSnapshotId: 0,
      })
      .returning();
    await db.insert(playerCareerStats).values({
      serverId: server.id,
      steamId: "1",
      displayName: "Alice",
    });

    const draft = { serverId: server.id, steamId: "1", amount: 100, reason: "kill" as const, eventId: event.id };

    await db.transaction((tx) => applyXpTransactionDrafts(tx, [draft]));
    await db.transaction((tx) => applyXpTransactionDrafts(tx, [draft]));

    const transactions = await transactionsFor("1");
    expect(transactions).toHaveLength(1);

    const career = await careerStatsFor(server.id, "1");
    expect(career.xp).toBe(100);
  });
});

// Exercises applyLevelUps end-to-end via ingestSnapshot (through
// pollAndPersistSnapshot) against a real Postgres database, asserting on the
// resulting PlayerLevelUp GameEvents and playerCareerStats.level - see
// ticket 06. Relies on the migration-seeded xp_rewards/level_thresholds
// defaults (kill +100, first_blood +100, streak3/5/10 +150/+250/+500; level
// 2 at 1,000 XP, level 3 at 2,500, level 4 at 4,500), plus (ticket 09) the
// migration-seeded daily challenge_definitions defaults, which a sustained
// kill streak also completes alongside the level-up scenarios below.
describe("Levels and level-up events (integration)", () => {
  const db: Database = createDb(process.env.DATABASE_URL!);

  async function seedServer() {
    const [server] = await db
      .insert(servers)
      .values({
        name: "Test Server",
        baseUrl: `http://rcon-level-engine-${crypto.randomUUID()}.test:9006`,
      })
      .returning();
    return server;
  }

  async function levelUpEventsFor(steamId: string) {
    const rows = await db
      .select()
      .from(gameEvents)
      .where(and(eq(gameEvents.steamId, steamId), eq(gameEvents.type, "PlayerLevelUp")))
      .orderBy(gameEvents.id);
    return rows;
  }

  async function careerStatsFor(serverId: number, steamId: string) {
    const [row] = await db
      .select()
      .from(playerCareerStats)
      .where(and(eq(playerCareerStats.serverId, serverId), eq(playerCareerStats.steamId, steamId)));
    return row;
  }

  afterEach(async () => {
    await db.delete(challengeCompletions);
    await db.delete(playerChallengeProgress);
    await db.delete(playerAchievements);
    await db.delete(xpTransactions);
    await db.delete(notifications);
    await db.delete(gameEvents);
    await db.delete(challengeInstances);
    await db.delete(playerMatchStats);
    await db.delete(playerCareerStats);
    await db.delete(matchSnapshots);
    await db.delete(matches);
    await db.delete(latestSnapshots);
    await db.delete(servers);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("does not fire PlayerLevelUp when an award doesn't cross a threshold", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
      {
        // 1 kill: 100 (kill) + 100 (first_blood) = 200 XP - well short of level 2's 1,000.
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 1, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);

    expect(await levelUpEventsFor("1")).toEqual([]);
    const career = await careerStatsFor(server.id, "1");
    expect(career.xp).toBe(200);
    expect(career.level).toBe(1);
  });

  it("fires PlayerLevelUp exactly once when an award crosses exactly one threshold", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
      {
        // 5 kills: 500 (kill) + 100 (first_blood) + 150 (streak3) + 250 (streak5) = 1,000 XP,
        // landing exactly on level 2's threshold, plus the seeded daily
        // "kill_streak" Challenge (target 5, +350) this same streak also
        // completes - see ticket 09. 1,350 total, still short of level 3's
        // 2,500 threshold.
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 5, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);

    const levelUps = await levelUpEventsFor("1");
    expect(levelUps).toHaveLength(1);
    expect(levelUps[0].metadata).toEqual({ level: 2 });

    const career = await careerStatsFor(server.id, "1");
    expect(career.xp).toBe(1350);
    expect(career.level).toBe(2);
  });

  it("fires one PlayerLevelUp per level when a single award crosses two thresholds at once", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
      {
        // 25 kills: 2,500 (kill) + 100 (first_blood) + 150+250+500 (streak3/5/10) =
        // 3,500 XP, plus every seeded daily Challenge this same streak
        // completes (ticket 09): kills (target 15, +300), kill_streak
        // (target 5, +350), kills_without_dying (target 8, +400), and
        // kills_in_match (target 10, +400) = 1,450 more. 4,950 total, crossing
        // level 2 (1,000), level 3 (2,500), and level 4 (4,500) in one batch.
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 25, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);

    const levelUps = await levelUpEventsFor("1");
    expect(levelUps.map((event) => event.metadata)).toEqual([{ level: 2 }, { level: 3 }, { level: 4 }]);

    const career = await careerStatsFor(server.id, "1");
    expect(career.xp).toBe(4950);
    expect(career.level).toBe(4);
  });
});

// Exercises closeMatch's MVP/win-loss rollup end-to-end (via
// pollAndPersistSnapshot) and directly (for the reprocessing-safety test,
// mirroring the XP ledger's own "never double-awards" test above) against a
// real Postgres database - see ticket 07. Relies on mvp_formula_weights'
// migration-seeded defaults (kills x10, deaths x-5).
describe("Match finalization: MVP + win/loss rollup (integration)", () => {
  const db: Database = createDb(process.env.DATABASE_URL!);

  async function seedServer() {
    const [server] = await db
      .insert(servers)
      .values({
        name: "Test Server",
        baseUrl: `http://rcon-match-finalization-${crypto.randomUUID()}.test:9006`,
      })
      .returning();
    return server;
  }

  async function closedMatchesFor(serverId: number) {
    return db
      .select()
      .from(matches)
      .where(and(eq(matches.serverId, serverId), isNotNull(matches.endedAt)));
  }

  async function careerStatsFor(serverId: number, steamId: string) {
    const [row] = await db
      .select()
      .from(playerCareerStats)
      .where(and(eq(playerCareerStats.serverId, serverId), eq(playerCareerStats.steamId, steamId)));
    return row;
  }

  afterEach(async () => {
    await db.delete(challengeCompletions);
    await db.delete(playerChallengeProgress);
    await db.delete(playerAchievements);
    await db.delete(xpTransactions);
    await db.delete(notifications);
    await db.delete(gameEvents);
    await db.delete(challengeInstances);
    await db.delete(playerMatchStats);
    await db.delete(playerCareerStats);
    await db.delete(matchSnapshots);
    await db.delete(matches);
    await db.delete(latestSnapshots);
    await db.delete(servers);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("increments matchesWon for the winning Faction's players, matchesLost for the rest, and stamps the MVP", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture({ map: "Sandstorm" }),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
          { steamId: "2", name: "Bob", faction: "Valkyra", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
      {
        status: statusFixture({ map: "Sandstorm" }),
        players: playersFixture([
          // Alice: 5 kills, 0 deaths -> score 50.
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 5, deaths: 0, cash: 0, pingMs: 40 },
          // Bob: 1 kill, 3 deaths -> score 10 - 15 = -5.
          { steamId: "2", name: "Bob", faction: "Valkyra", kills: 1, deaths: 3, cash: 0, pingMs: 40 },
        ]),
      },
      {
        // map change closes the Match - statusFixture()'s default scores lead with Lonestar 10-8.
        status: statusFixture({ map: "Deadcity" }),
        players: playersFixture([]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);

    const [closed] = await closedMatchesFor(server.id);
    expect(closed.winningFaction).toBe("Lonestar");
    expect(closed.mvpPlayerSteamId).toBe("1");
    expect(closed.mvpScore).toBe(50);

    const alice = await careerStatsFor(server.id, "1");
    expect(alice).toMatchObject({ matchesWon: 1, matchesLost: 0, mvpCount: 1 });

    const bob = await careerStatsFor(server.id, "2");
    expect(bob).toMatchObject({ matchesWon: 0, matchesLost: 1, mvpCount: 0 });
  });

  it("breaks a tied MVP score using the documented tie-break rule (more kills wins)", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture({ map: "Sandstorm" }),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
          { steamId: "2", name: "Bob", faction: "Valkyra", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
      {
        status: statusFixture({ map: "Sandstorm" }),
        players: playersFixture([
          // Alice: 10 kills, 0 deaths -> score 100.
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 10, deaths: 0, cash: 0, pingMs: 40 },
          // Bob: 15 kills, 10 deaths -> score 150 - 50 = 100, tied with Alice;
          // wins the tie-break on more kills (see mvp-engine.ts's `beats`).
          { steamId: "2", name: "Bob", faction: "Valkyra", kills: 15, deaths: 10, cash: 0, pingMs: 40 },
        ]),
      },
      {
        status: statusFixture({ map: "Deadcity" }),
        players: playersFixture([]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);

    const [closed] = await closedMatchesFor(server.id);
    expect(closed.mvpPlayerSteamId).toBe("2");
    expect(closed.mvpScore).toBe(100);

    const bob = await careerStatsFor(server.id, "2");
    expect(bob.mvpCount).toBe(1);
    const alice = await careerStatsFor(server.id, "1");
    expect(alice.mvpCount).toBe(0);
  });

  it("never double-counts matchesWon/matchesLost/mvpCount when closeMatch reprocesses an already-closed Match", async () => {
    const server = await seedServer();
    const [match] = await db
      .insert(matches)
      .values({ serverId: server.id, map: "Sandstorm", experiences: ["TeamDeathmatch"], startedAt: new Date() })
      .returning();

    await db.insert(matchSnapshots).values([
      {
        matchId: match.id,
        capturedAt: new Date(Date.now() - 1000),
        payload: snapshot({
          factions: [
            { name: "Lonestar", color: "#ff0000", score: 0 },
            { name: "Valkyra", color: "#0000ff", score: 0 },
          ],
          players: [player({ steamId: "1", faction: "Lonestar", kills: 0, deaths: 0, cash: 0 })],
        }),
      },
      {
        matchId: match.id,
        capturedAt: new Date(),
        payload: snapshot({
          factions: [
            { name: "Lonestar", color: "#ff0000", score: 10 },
            { name: "Valkyra", color: "#0000ff", score: 5 },
          ],
          players: [player({ steamId: "1", faction: "Lonestar", kills: 5, deaths: 0, cash: 0 })],
        }),
      },
    ]);

    const endedAt = new Date();
    await db.transaction((tx) => closeMatch(tx, { id: match.id, serverId: server.id }, endedAt));
    await db.transaction((tx) => closeMatch(tx, { id: match.id, serverId: server.id }, endedAt));

    const career = await careerStatsFor(server.id, "1");
    expect(career).toMatchObject({ matchesWon: 1, matchesLost: 0, mvpCount: 1 });

    const [closedRow] = await db.select().from(matches).where(eq(matches.id, match.id));
    expect(closedRow.winningFaction).toBe("Lonestar");
    expect(closedRow.mvpPlayerSteamId).toBe("1");
    expect(closedRow.mvpScore).toBe(50);
  });
});

// Exercises applyAchievementUnlockDrafts' persistence directly against a real
// Postgres database - see ticket 08. Deliberately bypasses
// pollAndPersistSnapshot/ingestSnapshot (achievement-engine.test.ts already
// covers computeAchievementUnlockDrafts/achievementUnlockedEvents as pure
// unit tests): what a real database is actually needed for here is proving
// the (server_id, steam_id, achievement_id) unique constraint - not
// application logic - is what makes an unlock idempotent, matching the XP
// ledger's own "never double-awards" test above. Relies on the
// migration-seeded achievement_definitions rows (first_blood, killing_spree,
// survivor, etc. - see migration 0011).
describe("Achievement engine (integration)", () => {
  const db: Database = createDb(process.env.DATABASE_URL!);

  async function seedServer() {
    const [server] = await db
      .insert(servers)
      .values({
        name: "Test Server",
        baseUrl: `http://rcon-achievement-engine-${crypto.randomUUID()}.test:9006`,
      })
      .returning();
    return server;
  }

  async function unlocksFor(serverId: number, steamId: string) {
    return db
      .select()
      .from(playerAchievements)
      .where(and(eq(playerAchievements.serverId, serverId), eq(playerAchievements.steamId, steamId)));
  }

  afterEach(async () => {
    await db.delete(playerAchievements);
    await db.delete(servers);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("writes a PlayerAchievement row for a genuinely new unlock, returning it as newly recorded", async () => {
    const server = await seedServer();

    const recorded = await db.transaction((tx) =>
      applyAchievementUnlockDrafts(tx, [
        { serverId: server.id, steamId: "1", achievementId: "first_blood", eventId: 1 },
      ]),
    );

    expect(recorded).toEqual([{ steamId: "1", achievementId: "first_blood" }]);

    const rows = await unlocksFor(server.id, "1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ serverId: server.id, steamId: "1", achievementId: "first_blood" });
  });

  it("unlocks distinct Achievements for the same player independently", async () => {
    const server = await seedServer();

    await db.transaction((tx) =>
      applyAchievementUnlockDrafts(tx, [
        { serverId: server.id, steamId: "1", achievementId: "first_blood", eventId: 1 },
        { serverId: server.id, steamId: "1", achievementId: "killing_spree", eventId: 2 },
      ]),
    );

    const rows = await unlocksFor(server.id, "1");
    expect(rows.map((row) => row.achievementId).sort()).toEqual(["first_blood", "killing_spree"]);
  });

  it("never double-unlocks the same Achievement, even if a recurring condition or a reprocessed event proposes it again", async () => {
    const server = await seedServer();
    const draft = { serverId: server.id, steamId: "1", achievementId: "killing_spree", eventId: 1 };

    const firstApply = await db.transaction((tx) => applyAchievementUnlockDrafts(tx, [draft]));
    // A second proposal for the exact same (server, player, Achievement) -
    // e.g. the streak reaching 5 again later in the same Match, or the same
    // GameEvent reprocessed - must insert nothing.
    const secondApply = await db.transaction((tx) => applyAchievementUnlockDrafts(tx, [{ ...draft, eventId: 99 }]));

    expect(firstApply).toEqual([{ steamId: "1", achievementId: "killing_spree" }]);
    expect(secondApply).toEqual([]);

    const rows = await unlocksFor(server.id, "1");
    expect(rows).toHaveLength(1);
  });
});

// Exercises daily Challenge generation/progress/completion end to end (via
// pollAndPersistSnapshot -> ingestSnapshot) against a real Postgres database -
// see ticket 09. Relies on the migration-seeded challenge_definitions
// defaults (kills target 15/+300 XP, kill_streak target 5/+350,
// kills_without_dying target 8/+400, kills_in_match target 10/+400, wins
// target 2/+400, matches_played target 3/+200) alongside xp_rewards' own
// migration-seeded defaults (kill +100, first_blood +100, streak3/5/10
// +150/+250/+500).
describe("Daily challenges (integration)", () => {
  const db: Database = createDb(process.env.DATABASE_URL!);

  async function seedServer() {
    const [server] = await db
      .insert(servers)
      .values({
        name: "Test Server",
        baseUrl: `http://rcon-challenge-engine-${crypto.randomUUID()}.test:9006`,
      })
      .returning();
    return server;
  }

  async function dailyDefinitionCount() {
    const rows = await db.select().from(challengeDefinitions).where(eq(challengeDefinitions.scope, "daily"));
    return rows.length;
  }

  async function instancesFor(serverId: number) {
    return db.select().from(challengeInstances).where(eq(challengeInstances.serverId, serverId));
  }

  async function instanceForType(serverId: number, type: ChallengeType) {
    const [row] = await db
      .select({
        id: challengeInstances.id,
        target: challengeDefinitions.target,
        xpReward: challengeDefinitions.xpReward,
      })
      .from(challengeInstances)
      .innerJoin(challengeDefinitions, eq(challengeInstances.definitionId, challengeDefinitions.id))
      .where(and(eq(challengeInstances.serverId, serverId), eq(challengeDefinitions.type, type)));
    return row;
  }

  async function progressFor(instanceId: number, steamId: string) {
    const [row] = await db
      .select()
      .from(playerChallengeProgress)
      .where(and(eq(playerChallengeProgress.instanceId, instanceId), eq(playerChallengeProgress.steamId, steamId)));
    return row;
  }

  async function completionsFor(instanceId: number) {
    return db.select().from(challengeCompletions).where(eq(challengeCompletions.instanceId, instanceId));
  }

  async function careerStatsFor(serverId: number, steamId: string) {
    const [row] = await db
      .select()
      .from(playerCareerStats)
      .where(and(eq(playerCareerStats.serverId, serverId), eq(playerCareerStats.steamId, steamId)));
    return row;
  }

  afterEach(async () => {
    await db.delete(challengeCompletions);
    await db.delete(playerChallengeProgress);
    await db.delete(xpTransactions);
    await db.delete(playerAchievements);
    await db.delete(notifications);
    await db.delete(gameEvents);
    await db.delete(challengeInstances);
    await db.delete(playerMatchStats);
    await db.delete(playerCareerStats);
    await db.delete(matchSnapshots);
    await db.delete(matches);
    await db.delete(latestSnapshots);
    await db.delete(servers);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("generates one ChallengeInstance per daily definition, and never duplicates across polls", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      { status: statusFixture(), players: playersFixture([]) },
      { status: statusFixture({ lighting: "Night" }), players: playersFixture([]) },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    const afterFirstPoll = await instancesFor(server.id);
    expect(afterFirstPoll).toHaveLength(await dailyDefinitionCount());

    await pollAndPersistSnapshot(db, client, server.id);
    const afterSecondPoll = await instancesFor(server.id);
    expect(afterSecondPoll.map((row) => row.id).sort()).toEqual(afterFirstPoll.map((row) => row.id).sort());
  });

  it("increments kills progress per PlayerKilled event and completes exactly once at target", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
      {
        // 15 kills reaches the seeded "kills" definition's target exactly.
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 15, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
      {
        // One further kill must not award "kills" a second time.
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 16, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);

    const kills = await instanceForType(server.id, "kills");
    expect(await progressFor(kills.id, "1")).toMatchObject({ progress: 15 });
    expect(await completionsFor(kills.id)).toHaveLength(1);

    let killAwards = await db
      .select()
      .from(xpTransactions)
      .where(and(eq(xpTransactions.reason, "challenge_completed"), eq(xpTransactions.challengeInstanceId, kills.id)));
    expect(killAwards).toHaveLength(1);
    expect(killAwards[0].amount).toBe(kills.xpReward);

    await pollAndPersistSnapshot(db, client, server.id);

    expect(await progressFor(kills.id, "1")).toMatchObject({ progress: 16 });
    expect(await completionsFor(kills.id)).toHaveLength(1);
    killAwards = await db
      .select()
      .from(xpTransactions)
      .where(and(eq(xpTransactions.reason, "challenge_completed"), eq(xpTransactions.challengeInstanceId, kills.id)));
    expect(killAwards).toHaveLength(1);
  });

  it("also raises a kill_streak instance's watermark from the same kills, and folds every award into playerCareerStats.xp", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
      {
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 15, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);

    const killStreak = await instanceForType(server.id, "kill_streak");
    expect(await progressFor(killStreak.id, "1")).toMatchObject({ progress: 15 });
    expect(await completionsFor(killStreak.id)).toHaveLength(1);

    const allAwards = await db.select().from(xpTransactions).where(eq(xpTransactions.steamId, "1"));
    const totalAwarded = allAwards.reduce((sum, row) => sum + row.amount, 0);
    const career = await careerStatsFor(server.id, "1");
    expect(career.xp).toBe(totalAwarded);
  });

  it("increments matches_played from a MatchEnded event for every participant", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
      {
        // map change closes the first Match.
        status: statusFixture({ map: "Deadcity" }),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);

    const matchesPlayed = await instanceForType(server.id, "matches_played");
    expect(await progressFor(matchesPlayed.id, "1")).toMatchObject({ progress: 1 });
  });

  it("keeps kills_without_dying counting across a Match boundary, while kill_streak resets - see ticket 09", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
      {
        // 3 kills in the first Match, no death.
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 3, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
      {
        // map change closes the first Match and opens a second one -
        // currentKillStreak (and thus kill_streak's own metadata.streak
        // events) resets to 0 here, but the player still hasn't died.
        status: statusFixture({ map: "Deadcity" }),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
      {
        // 5 more kills in the second Match, still no death: 8 total kills
        // without dying (reaching kills_without_dying's seeded target of 8),
        // but only a fresh 5-kill streak within this Match (reaching
        // kill_streak's seeded target of 5, not 8).
        status: statusFixture({ map: "Deadcity" }),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 5, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);

    const killStreak = await instanceForType(server.id, "kill_streak");
    expect(await progressFor(killStreak.id, "1")).toMatchObject({ progress: 5 });
    expect(await completionsFor(killStreak.id)).toHaveLength(1);

    const killsWithoutDying = await instanceForType(server.id, "kills_without_dying");
    expect(await progressFor(killsWithoutDying.id, "1")).toMatchObject({ progress: 8 });
    expect(await completionsFor(killsWithoutDying.id)).toHaveLength(1);
  });
});

// Exercises the Notification Engine end to end (via pollAndPersistSnapshot ->
// ingestSnapshot) against a real Postgres database - see ticket 10. Relies on
// the migration-seeded notification_rules/notification_settings defaults
// (MatchStarted/MatchEnded/AchievementUnlocked/KillStreak10/ChallengeCompleted
// at "high" priority, KillStreak5/PlayerLevelUp at "normal", KillStreak3 at
// "low", max 20 low/normal per minute) alongside every other config table's
// own migration-seeded defaults.
describe("Notification engine (integration)", () => {
  const db: Database = createDb(process.env.DATABASE_URL!);

  async function seedServer() {
    const [server] = await db
      .insert(servers)
      .values({
        name: "Test Server",
        baseUrl: `http://rcon-notification-engine-${crypto.randomUUID()}.test:9006`,
      })
      .returning();
    return server;
  }

  async function notificationsFor(serverId: number) {
    return db.select().from(notifications).where(eq(notifications.serverId, serverId));
  }

  afterEach(async () => {
    await db.delete(challengeCompletions);
    await db.delete(playerChallengeProgress);
    await db.delete(playerAchievements);
    await db.delete(xpTransactions);
    await db.delete(notifications);
    await db.delete(gameEvents);
    await db.delete(challengeInstances);
    await db.delete(playerMatchStats);
    await db.delete(playerCareerStats);
    await db.delete(matchSnapshots);
    await db.delete(matches);
    await db.delete(latestSnapshots);
    await db.delete(servers);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("records a small set of high-priority Notifications for a full Match, never one per kill", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
      {
        // 10 kills in one poll: streak climbs 1 through 10 (crossing the
        // 3/5/10 Notification milestones once each), unlocks
        // killing_spree/rampage/survivor, and completes three daily
        // Challenges - the same scenario as the XP ledger's "fires each
        // kill-streak milestone..." test above.
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 10, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
      {
        // map change closes the Match (Lonestar leads 10-8 by default) and opens a second one.
        status: statusFixture({ map: "Deadcity" }),
        players: playersFixture([]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);

    const rows = await notificationsFor(server.id);

    // Far fewer Notifications than GameEvents this run produced (10
    // PlayerKilled events, a PlayerJoined/PlayerLeft pair, etc.) - none of
    // those routine events ever reach this table at all.
    expect(rows).toHaveLength(14);
    expect(rows.filter((r) => r.priority === "high")).toHaveLength(10);
    expect(rows.filter((r) => r.priority === "normal")).toHaveLength(3);
    expect(rows.filter((r) => r.priority === "low")).toHaveLength(1);

    const messages = rows.map((r) => r.message);
    expect(messages).toContain("🏁 Match started on Sandstorm!");
    expect(messages).toContain("🏆 Match ended - Lonestar wins!");
    expect(messages).toContain("🔥 1 is on a 10 kill streak!");
    expect(messages).toContain("⚡ 1 hit a 5 kill streak!");
    expect(messages).toContain("🔫 1 is on a 3 kill streak!");
    expect(messages).toContain("🏅 1 unlocked an achievement: Killing Spree!");
    expect(messages).toContain("🏅 1 unlocked an achievement: Rampage!");
    expect(messages).toContain("🏅 1 unlocked an achievement: Survivor!");
    expect(messages).toContain("⬆️ 1 leveled up to level 2!");
    expect(messages).toContain("⬆️ 1 leveled up to level 3!");
    expect(messages.filter((m) => m.startsWith("✅"))).toHaveLength(3);
  });

  it("suppresses excess low/normal-priority Notifications once the per-minute cap is reached, without ever dropping a high-priority one", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
      {
        // A 3 kill streak alone - normally a "low" priority Notification.
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 3, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
      {
        // map change closes the Match and opens a second one - both "high" priority.
        status: statusFixture({ map: "Deadcity" }),
        players: playersFixture([]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id); // opens the Match

    const [settings] = await db.select().from(notificationSettings);
    const cap = settings.maxLowNormalPerMinute;

    const [matchStarted] = await db
      .select({ id: gameEvents.id })
      .from(gameEvents)
      .where(and(eq(gameEvents.serverId, server.id), eq(gameEvents.type, "MatchStarted")));

    // Pre-fill this Server's trailing-minute low/normal budget, as if `cap`
    // other low/normal Notifications had already fired moments ago.
    await db.insert(notifications).values(
      Array.from({ length: cap }, () => ({
        serverId: server.id,
        priority: "low" as const,
        message: "pre-filled",
        eventId: matchStarted.id,
        timestamp: new Date(Date.now() - 5_000),
      })),
    );

    await pollAndPersistSnapshot(db, client, server.id); // the 3 kill streak

    const afterStreak = await notificationsFor(server.id);
    // 1 (the opening poll's "high" priority MatchStarted) + the pre-filled
    // cap - the new KillStreak3 draft found no budget left and was dropped,
    // not cap + 2.
    expect(afterStreak).toHaveLength(cap + 1);
    expect(afterStreak.some((r) => r.message.includes("3 kill streak"))).toBe(false);

    await pollAndPersistSnapshot(db, client, server.id); // closes + reopens the Match

    const afterMatchBoundary = await notificationsFor(server.id);
    // MatchEnded, the new MatchStarted, and an AchievementUnlocked
    // ("Survivor" - Alice closed the Match without dying) are all "high"
    // priority and are never subject to the cap, even though the
    // low/normal budget is still fully consumed.
    const previousIds = new Set(afterStreak.map((r) => r.id));
    const newRows = afterMatchBoundary.filter((r) => !previousIds.has(r.id));
    expect(newRows.every((r) => r.priority === "high")).toBe(true);
    const newMessages = newRows.map((r) => r.message);
    expect(newMessages).toContain("🏆 Match ended - Lonestar wins!");
    expect(newMessages).toContain("🏁 Match started on Deadcity!");
  });
});
