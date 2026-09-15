import {
  challengeCompletions,
  challengeInstances,
  createDb,
  gameEvents,
  latestSnapshots,
  matchSnapshots,
  matches,
  playerAchievements,
  playerCareerStats,
  playerChallengeProgress,
  playerMatchStats,
  servers,
  xpTransactions,
  type Database,
  type SnapshotFaction,
  type SnapshotPlayer,
} from "@wdza-stats/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  diffFactionScoreGameEvents,
  diffKillDeathGameEvents,
  diffKillStreakGameEvents,
  diffRosterGameEvents,
  matchLifecycleEvent,
  type GameEventContext,
} from "./game-events";
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

function context(overrides: Partial<GameEventContext> = {}): GameEventContext {
  return {
    serverId: 1,
    matchId: 1,
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
    sourceSnapshotId: 1,
    ...overrides,
  };
}

function faction(overrides: Partial<SnapshotFaction> = {}): SnapshotFaction {
  return { name: "Lonestar", color: "#ff0000", score: 0, ...overrides };
}

describe("diffRosterGameEvents", () => {
  it("emits PlayerJoined for a steamId new to the roster", () => {
    const events = diffRosterGameEvents([], [player({ steamId: "2", faction: "Valkyra" })], context());

    expect(events).toEqual([
      expect.objectContaining({
        type: "PlayerJoined",
        steamId: "2",
        faction: "Valkyra",
        targetSteamId: null,
      }),
    ]);
  });

  it("emits PlayerLeft for a steamId that dropped off the roster", () => {
    const events = diffRosterGameEvents([player({ steamId: "2", faction: "Valkyra" })], [], context());

    expect(events).toEqual([
      expect.objectContaining({
        type: "PlayerLeft",
        steamId: "2",
        faction: "Valkyra",
        targetSteamId: null,
      }),
    ]);
  });

  it("emits nothing when the roster is unchanged", () => {
    const roster = [player({ steamId: "1" }), player({ steamId: "2" })];
    expect(diffRosterGameEvents(roster, roster, context())).toEqual([]);
  });

  it("treats a missing previous roster as empty, joining everyone currently online", () => {
    const events = diffRosterGameEvents(
      undefined,
      [player({ steamId: "1" }), player({ steamId: "2" })],
      context(),
    );

    expect(events.map((event) => event.type)).toEqual(["PlayerJoined", "PlayerJoined"]);
  });

  it("attributes each event to the Server/Match/timestamp/sourceSnapshotId given in context", () => {
    const [event] = diffRosterGameEvents(
      [],
      [player({ steamId: "1" })],
      context({ serverId: 7, matchId: 42, sourceSnapshotId: 99 }),
    );

    expect(event).toMatchObject({ serverId: 7, matchId: 42, sourceSnapshotId: 99 });
  });

  it("derives a stable idempotencyKey from the event's identity, not from sourceSnapshotId", () => {
    const roster = [player({ steamId: "1" })];
    const first = diffRosterGameEvents([], roster, context({ sourceSnapshotId: 1 }))[0];
    const second = diffRosterGameEvents([], roster, context({ sourceSnapshotId: 2 }))[0];

    expect(first.idempotencyKey).toBe(second.idempotencyKey);
  });

  it("gives PlayerJoined/PlayerLeft distinct idempotencyKeys for the same steamId and timestamp", () => {
    const joined = diffRosterGameEvents([], [player({ steamId: "1" })], context())[0];
    const left = diffRosterGameEvents([player({ steamId: "1" })], [], context())[0];

    expect(joined.idempotencyKey).not.toBe(left.idempotencyKey);
  });
});

describe("matchLifecycleEvent", () => {
  it("builds a MatchStarted draft with no steamId/faction/targetSteamId", () => {
    const event = matchLifecycleEvent("MatchStarted", context({ matchId: 5 }));

    expect(event).toMatchObject({
      type: "MatchStarted",
      matchId: 5,
      steamId: null,
      faction: null,
      targetSteamId: null,
    });
  });

  it("builds a MatchEnded draft carrying the ended Match's id", () => {
    const event = matchLifecycleEvent("MatchEnded", context({ matchId: 5 }));

    expect(event).toMatchObject({ type: "MatchEnded", matchId: 5 });
  });

  it("derives an idempotencyKey from Server + Match + type alone, not the timestamp", () => {
    const first = matchLifecycleEvent(
      "MatchStarted",
      context({ matchId: 5, timestamp: new Date("2026-01-01T00:00:00.000Z") }),
    );
    const second = matchLifecycleEvent(
      "MatchStarted",
      context({ matchId: 5, timestamp: new Date("2026-01-01T00:05:00.000Z") }),
    );

    expect(first.idempotencyKey).toBe(second.idempotencyKey);
  });

  it("gives MatchStarted and MatchEnded distinct idempotencyKeys for the same matchId", () => {
    const started = matchLifecycleEvent("MatchStarted", context({ matchId: 5 }));
    const ended = matchLifecycleEvent("MatchEnded", context({ matchId: 5 }));

    expect(started.idempotencyKey).not.toBe(ended.idempotencyKey);
  });
});

describe("diffKillDeathGameEvents", () => {
  it("emits one PlayerKilled per unit increase in the kill counter", () => {
    const previous = [player({ steamId: "1", kills: 2 })];
    const current = [player({ steamId: "1", kills: 5 })];

    const events = diffKillDeathGameEvents(previous, current, context());

    expect(events.filter((event) => event.type === "PlayerKilled")).toHaveLength(3);
  });

  it("emits one PlayerDeath per unit increase in the death counter", () => {
    const previous = [player({ steamId: "1", deaths: 0 })];
    const current = [player({ steamId: "1", deaths: 2 })];

    const events = diffKillDeathGameEvents(previous, current, context());

    expect(events.filter((event) => event.type === "PlayerDeath")).toHaveLength(2);
  });

  it("never populates targetSteamId", () => {
    const previous = [player({ steamId: "1", kills: 0, deaths: 0 })];
    const current = [player({ steamId: "1", kills: 1, deaths: 1 })];

    const events = diffKillDeathGameEvents(previous, current, context());

    expect(events.every((event) => event.targetSteamId === null)).toBe(true);
  });

  it("emits nothing for a player whose counters are unchanged", () => {
    const roster = [player({ steamId: "1", kills: 3, deaths: 1 })];
    expect(diffKillDeathGameEvents(roster, roster, context())).toEqual([]);
  });

  it("skips a player absent from previousPlayers instead of diffing against a 0 baseline", () => {
    const previous: ReturnType<typeof player>[] = [];
    const current = [player({ steamId: "1", kills: 4 })];

    expect(diffKillDeathGameEvents(previous, current, context())).toEqual([]);
  });

  it("derives a stable idempotencyKey from the resulting counter value, not the timestamp", () => {
    const previous = [player({ steamId: "1", kills: 2 })];
    const current = [player({ steamId: "1", kills: 3 })];

    const first = diffKillDeathGameEvents(previous, current, context({ timestamp: new Date("2026-01-01T00:00:00.000Z") }))[0];
    const second = diffKillDeathGameEvents(previous, current, context({ timestamp: new Date("2026-01-01T00:05:00.000Z") }))[0];

    expect(first.idempotencyKey).toBe(second.idempotencyKey);
  });
});

describe("diffFactionScoreGameEvents", () => {
  it("emits FactionScoreChanged with old and new score for a normal increase", () => {
    // Lonestar is already the recorded leader and stays the sole leader
    // after the increase, so no FactionTookLead fires alongside it.
    const previous = [faction({ name: "Lonestar", score: 5 }), faction({ name: "Valkyra", score: 0 })];
    const current = [faction({ name: "Lonestar", score: 10 }), faction({ name: "Valkyra", score: 0 })];

    const events = diffFactionScoreGameEvents(previous, current, "Lonestar", context());

    expect(events).toEqual([
      expect.objectContaining({
        type: "FactionScoreChanged",
        faction: "Lonestar",
        metadata: { previousScore: 5, newScore: 10 },
      }),
    ]);
  });

  it("emits nothing when no Faction's score changed", () => {
    const factions = [faction({ name: "Lonestar", score: 5 }), faction({ name: "Valkyra", score: 5 })];
    expect(diffFactionScoreGameEvents(factions, factions, null, context())).toEqual([]);
  });

  it("skips a Faction absent from previousFactions instead of diffing against a 0 baseline", () => {
    // previousLeader already names Lonestar so its continuing sole lead
    // doesn't also fire FactionTookLead here, isolating the assertion to
    // FactionScoreChanged.
    const previous: SnapshotFaction[] = [];
    const current = [faction({ name: "Lonestar", score: 10 })];

    expect(diffFactionScoreGameEvents(previous, current, "Lonestar", context())).toEqual([]);
  });

  it("fires FactionTookLead when a Faction strictly overtakes and no one was leading before", () => {
    const previous = [faction({ name: "Lonestar", score: 0 }), faction({ name: "Valkyra", score: 0 })];
    const current = [faction({ name: "Lonestar", score: 10 }), faction({ name: "Valkyra", score: 0 })];

    const events = diffFactionScoreGameEvents(previous, current, null, context());

    expect(events).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "FactionTookLead", faction: "Lonestar" })]),
    );
  });

  it("does not fire FactionTookLead when a score change produces a tie for the lead", () => {
    const previous = [faction({ name: "Lonestar", score: 5 }), faction({ name: "Valkyra", score: 0 })];
    const current = [faction({ name: "Lonestar", score: 5 }), faction({ name: "Valkyra", score: 5 })];

    const events = diffFactionScoreGameEvents(previous, current, "Lonestar", context());

    expect(events.some((event) => event.type === "FactionTookLead")).toBe(false);
  });

  it("fires FactionTookLead when a Faction overtakes a tie to take sole lead", () => {
    const previous = [faction({ name: "Lonestar", score: 10 }), faction({ name: "Valkyra", score: 10 })];
    const current = [faction({ name: "Lonestar", score: 10 }), faction({ name: "Valkyra", score: 12 })];

    const events = diffFactionScoreGameEvents(previous, current, "Lonestar", context());

    expect(events).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "FactionTookLead", faction: "Valkyra" })]),
    );
  });

  it("does not fire FactionTookLead when the current leader already held the lead through a tie", () => {
    // Lonestar led, tied, and pulled back ahead without Valkyra ever
    // strictly overtaking - the tie must not have reset who's "leading".
    const previous = [faction({ name: "Lonestar", score: 10 }), faction({ name: "Valkyra", score: 10 })];
    const current = [faction({ name: "Lonestar", score: 12 }), faction({ name: "Valkyra", score: 10 })];

    const events = diffFactionScoreGameEvents(previous, current, "Lonestar", context());

    expect(events.some((event) => event.type === "FactionTookLead")).toBe(false);
  });

  it("does not fire FactionTookLead when the previous leader stays the sole leader", () => {
    const previous = [faction({ name: "Lonestar", score: 5 }), faction({ name: "Valkyra", score: 0 })];
    const current = [faction({ name: "Lonestar", score: 10 }), faction({ name: "Valkyra", score: 0 })];

    const events = diffFactionScoreGameEvents(previous, current, "Lonestar", context());

    expect(events.some((event) => event.type === "FactionTookLead")).toBe(false);
  });

  it("derives a stable idempotencyKey for FactionScoreChanged from the resulting score, not the timestamp", () => {
    const previous = [faction({ name: "Lonestar", score: 5 })];
    const current = [faction({ name: "Lonestar", score: 10 })];

    const first = diffFactionScoreGameEvents(
      previous,
      current,
      null,
      context({ timestamp: new Date("2026-01-01T00:00:00.000Z") }),
    )[0];
    const second = diffFactionScoreGameEvents(
      previous,
      current,
      null,
      context({ timestamp: new Date("2026-01-01T00:05:00.000Z") }),
    )[0];

    expect(first.idempotencyKey).toBe(second.idempotencyKey);
  });
});

describe("diffKillStreakGameEvents", () => {
  it("fires PlayerKillStreakStarted on the first kill of a streak", () => {
    const previous = [player({ steamId: "1", kills: 0 })];
    const current = [player({ steamId: "1", kills: 1 })];

    const { events, updates } = diffKillStreakGameEvents(previous, current, new Map(), context());

    expect(events).toEqual([
      expect.objectContaining({ type: "PlayerKillStreakStarted", steamId: "1", metadata: { streak: 1 } }),
    ]);
    expect(updates).toEqual([
      expect.objectContaining({ steamId: "1", currentKillStreak: 1, highestKillStreak: 1 }),
    ]);
  });

  it("fires PlayerKillStreakIncreased for each kill after the first, in one diff", () => {
    const previous = [player({ steamId: "1", kills: 0 })];
    const current = [player({ steamId: "1", kills: 3 })];

    const { events, updates } = diffKillStreakGameEvents(previous, current, new Map(), context());

    expect(events.map((event) => event.type)).toEqual([
      "PlayerKillStreakStarted",
      "PlayerKillStreakIncreased",
      "PlayerKillStreakIncreased",
    ]);
    expect(updates).toEqual([
      expect.objectContaining({ currentKillStreak: 3, highestKillStreak: 3 }),
    ]);
  });

  it("continues an in-progress streak using currentStreaks rather than starting from 0", () => {
    const previous = [player({ steamId: "1", kills: 5 })];
    const current = [player({ steamId: "1", kills: 6 })];

    const { events, updates } = diffKillStreakGameEvents(
      previous,
      current,
      new Map([["1", 4]]),
      context(),
    );

    expect(events).toEqual([
      expect.objectContaining({ type: "PlayerKillStreakIncreased", metadata: { streak: 5 } }),
    ]);
    expect(updates).toEqual([
      expect.objectContaining({ currentKillStreak: 5, highestKillStreak: 5 }),
    ]);
  });

  it("fires PlayerKillStreakBroken on a death that ends a streak of at least 1", () => {
    const previous = [player({ steamId: "1", deaths: 0 })];
    const current = [player({ steamId: "1", deaths: 1 })];

    const { events, updates } = diffKillStreakGameEvents(
      previous,
      current,
      new Map([["1", 3]]),
      context(),
    );

    expect(events).toEqual([
      expect.objectContaining({ type: "PlayerKillStreakBroken", steamId: "1", metadata: { streak: 3 } }),
    ]);
    expect(updates).toEqual([
      expect.objectContaining({ currentKillStreak: 0, highestKillStreak: 3 }),
    ]);
  });

  it("fires nothing for a death when the streak is already 0", () => {
    const previous = [player({ steamId: "1", deaths: 0 })];
    const current = [player({ steamId: "1", deaths: 1 })];

    const { events, updates } = diffKillStreakGameEvents(previous, current, new Map(), context());

    expect(events).toEqual([]);
    expect(updates).toEqual([
      expect.objectContaining({ currentKillStreak: 0, highestKillStreak: 0 }),
    ]);
  });

  it("treats every kill in a diff as happening before every death, breaking the streak once at the end", () => {
    const previous = [player({ steamId: "1", kills: 0, deaths: 0 })];
    const current = [player({ steamId: "1", kills: 2, deaths: 1 })];

    const { events, updates } = diffKillStreakGameEvents(previous, current, new Map(), context());

    expect(events.map((event) => event.type)).toEqual([
      "PlayerKillStreakStarted",
      "PlayerKillStreakIncreased",
      "PlayerKillStreakBroken",
    ]);
    expect(updates).toEqual([
      expect.objectContaining({ currentKillStreak: 0, highestKillStreak: 2 }),
    ]);
  });

  it("skips a player absent from previousPlayers instead of diffing against a 0 baseline", () => {
    const previous: ReturnType<typeof player>[] = [];
    const current = [player({ steamId: "1", kills: 1 })];

    const { events, updates } = diffKillStreakGameEvents(previous, current, new Map(), context());

    expect(events).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("emits nothing for a player whose kill/death counters are unchanged", () => {
    const roster = [player({ steamId: "1", kills: 3, deaths: 1 })];

    const { events, updates } = diffKillStreakGameEvents(roster, roster, new Map([["1", 2]]), context());

    expect(events).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("derives a stable idempotencyKey from the resulting kills counter, not the timestamp", () => {
    const previous = [player({ steamId: "1", kills: 0 })];
    const current = [player({ steamId: "1", kills: 1 })];

    const first = diffKillStreakGameEvents(
      previous,
      current,
      new Map(),
      context({ timestamp: new Date("2026-01-01T00:00:00.000Z") }),
    ).events[0];
    const second = diffKillStreakGameEvents(
      previous,
      current,
      new Map(),
      context({ timestamp: new Date("2026-01-01T00:05:00.000Z") }),
    ).events[0];

    expect(first.idempotencyKey).toBe(second.idempotencyKey);
  });

  it("gives the same kill a matching idempotencyKey even when it resolves to a different type", () => {
    // The same kill (kills 0 -> 1) computed against two different starting
    // streaks resolves to different types (Started vs Increased) because
    // `currentStreaks` is mutable external state, not part of the Snapshot
    // pair itself - unlike every other event in this file, where `type` is
    // fully determined by the two Snapshots alone. If each type produced
    // its own idempotencyKey, a re-computation racing a already-committed
    // one would dodge the unique constraint and insert a genuine duplicate
    // row. Both must key identically so onConflictDoNothing still catches it.
    const previous = [player({ steamId: "1", kills: 0 })];
    const current = [player({ steamId: "1", kills: 1 })];

    const started = diffKillStreakGameEvents(previous, current, new Map(), context()).events[0];
    const increased = diffKillStreakGameEvents(previous, current, new Map([["1", 4]]), context()).events[0];

    expect(started.type).toBe("PlayerKillStreakStarted");
    expect(increased.type).toBe("PlayerKillStreakIncreased");
    expect(started.idempotencyKey).toBe(increased.idempotencyKey);
  });

  it("gives repeat visits to the same streak value distinct idempotencyKeys", () => {
    // Streak reaches 1, breaks, then reaches 1 again later in the same
    // Match - keying on the streak value alone would collide.
    const firstStreak = diffKillStreakGameEvents(
      [player({ steamId: "1", kills: 0 })],
      [player({ steamId: "1", kills: 1 })],
      new Map(),
      context(),
    ).events[0];
    const secondStreak = diffKillStreakGameEvents(
      [player({ steamId: "1", kills: 1 })],
      [player({ steamId: "1", kills: 2 })],
      new Map([["1", 0]]),
      context(),
    ).events[0];

    expect(firstStreak.idempotencyKey).not.toBe(secondStreak.idempotencyKey);
  });
});

// Integration: runs the real ingestion pipeline against a real test Postgres
// database and asserts on the resulting GameEvent rows - see spec.md
// "Worker seam" and match-tracker.test.ts for the established pattern.
describe("GameEvent recording (integration)", () => {
  const db: Database = createDb(process.env.DATABASE_URL!);

  async function seedServer() {
    const [server] = await db
      .insert(servers)
      .values({
        name: "Test Server",
        baseUrl: `http://rcon-game-events-${crypto.randomUUID()}.test:9006`,
      })
      .returning();
    return server;
  }

  afterEach(async () => {
    await db.delete(challengeCompletions);
    await db.delete(playerChallengeProgress);
    await db.delete(playerAchievements);
    await db.delete(xpTransactions);
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

  it("records a PlayerJoined event for a normal join", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      { status: statusFixture(), players: playersFixture([]) },
      {
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);

    const rows = await db.select().from(gameEvents).where(eq(gameEvents.serverId, server.id));
    // The first poll (no previous Snapshot at all) also opens a Match, so a
    // MatchStarted event is recorded alongside the PlayerJoined - see
    // ticket 02's match-lifecycle event emission.
    expect(rows.filter((row) => row.type === "PlayerJoined")).toEqual([
      expect.objectContaining({
        type: "PlayerJoined",
        steamId: "1",
        faction: "Lonestar",
        targetSteamId: null,
      }),
    ]);
  });

  it("records a PlayerLeft event for a normal leave", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
      { status: statusFixture(), players: playersFixture([]) },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);

    const rows = await db.select().from(gameEvents).where(eq(gameEvents.serverId, server.id));
    // The first poll (no previous Snapshot at all) also reports Alice as
    // joined - see diffRosterGameEvents' "missing previous roster" case -
    // and opens a Match (MatchStarted), see ticket 02.
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "PlayerJoined", steamId: "1" }),
        expect.objectContaining({ type: "PlayerLeft", steamId: "1", faction: "Lonestar" }),
      ]),
    );
    expect(rows.filter((row) => row.type === "PlayerJoined" || row.type === "PlayerLeft")).toHaveLength(2);
  });

  it("keeps a single Match open with no duplicate join event when a repeated poll reports an unchanged roster", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      { status: statusFixture(), players: playersFixture([]) },
      {
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id); // nobody online
    await pollAndPersistSnapshot(db, client, server.id); // Alice joins
    await pollAndPersistSnapshot(db, client, server.id); // same roster - scriptedRconClient repeats the last entry

    const rows = await db.select().from(gameEvents).where(eq(gameEvents.serverId, server.id));
    expect(rows.filter((row) => row.type === "PlayerJoined")).toHaveLength(1);
  });

  // The scenario above shows a repeated poll naturally produces no further
  // diff once the roster it reports has already been persisted. That alone
  // doesn't prove the idempotencyKey does anything: a true retry - the same
  // (previous, current, timestamp) comparison persisted twice without the
  // first write's result being visible yet, e.g. a retried transaction, or
  // two overlapping writers - needs its own coverage of the actual dedup
  // mechanism, exercised directly here.
  it("never creates a duplicate row when the same computed event is persisted twice", async () => {
    const server = await seedServer();
    const [match] = await db
      .insert(matches)
      .values({
        serverId: server.id,
        map: "Sandstorm",
        experiences: ["TeamDeathmatch"],
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
      })
      .returning();

    const [draft] = diffRosterGameEvents(
      [],
      [player({ steamId: "1" })],
      context({ serverId: server.id, matchId: match.id, sourceSnapshotId: 1 }),
    );

    await db.insert(gameEvents).values(draft).onConflictDoNothing({ target: gameEvents.idempotencyKey });
    await db.insert(gameEvents).values(draft).onConflictDoNothing({ target: gameEvents.idempotencyKey });

    const rows = await db.select().from(gameEvents).where(eq(gameEvents.serverId, server.id));
    expect(rows).toHaveLength(1);
  });

  it("fires MatchStarted exactly once when a new Match opens", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([{ status: statusFixture(), players: playersFixture([]) }]);

    await pollAndPersistSnapshot(db, client, server.id);

    const rows = await db.select().from(gameEvents).where(eq(gameEvents.serverId, server.id));
    const started = rows.filter((row) => row.type === "MatchStarted");
    expect(started).toHaveLength(1);
    expect(started[0].steamId).toBeNull();
  });

  it("fires MatchEnded carrying the closed Match's id, and MatchStarted for the new one, on a boundary", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      { status: statusFixture(), players: playersFixture([]) },
      { status: statusFixture(), players: playersFixture([]) }, // no boundary
      { status: statusFixture({ map: "Deadcity" }), players: playersFixture([]) }, // boundary
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    const [firstMatch] = await db.select().from(matches).where(eq(matches.serverId, server.id));

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);

    const rows = await db.select().from(gameEvents).where(eq(gameEvents.serverId, server.id));
    const ended = rows.filter((row) => row.type === "MatchEnded");
    const started = rows.filter((row) => row.type === "MatchStarted");

    expect(ended).toEqual([expect.objectContaining({ type: "MatchEnded", matchId: firstMatch.id })]);
    expect(started).toHaveLength(2);
    expect(started.some((row) => row.matchId !== firstMatch.id)).toBe(true);
  });

  it("records PlayerKilled once per kill and PlayerDeath once per death between polls", async () => {
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
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 3, deaths: 1, cash: 0, pingMs: 40 },
        ]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);

    const rows = await db.select().from(gameEvents).where(eq(gameEvents.serverId, server.id));
    const killed = rows.filter((row) => row.type === "PlayerKilled");
    const died = rows.filter((row) => row.type === "PlayerDeath");

    expect(killed).toHaveLength(3);
    expect(died).toHaveLength(1);
    expect([...killed, ...died].every((row) => row.targetSteamId === null)).toBe(true);
  });

  it("produces zero spurious PlayerKilled/PlayerDeath on a same-map counter reset", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 5, deaths: 1, cash: 400, pingMs: 40 },
        ]),
      },
      {
        // still climbing within the same Match - not a boundary
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 8, deaths: 2, cash: 900, pingMs: 40 },
        ]),
      },
      {
        // same map, same rotation, but counters reset - a same-map restart
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id); // kills 5->8, deaths 1->2
    await pollAndPersistSnapshot(db, client, server.id); // reset closes the Match - no spurious kill/death events

    const rows = await db.select().from(gameEvents).where(eq(gameEvents.serverId, server.id));
    expect(rows.filter((row) => row.type === "PlayerKilled")).toHaveLength(3);
    expect(rows.filter((row) => row.type === "PlayerDeath")).toHaveLength(1);
    expect(rows.filter((row) => row.type === "MatchEnded")).toHaveLength(1);
    expect(rows.filter((row) => row.type === "MatchStarted")).toHaveLength(2);
  });

  it("produces zero spurious PlayerKilled/PlayerDeath across a map/rotation change", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 5, deaths: 1, cash: 400, pingMs: 40 },
        ]),
      },
      {
        // map change: a boundary even though the counters below only climbed
        status: statusFixture({ map: "Deadcity" }),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 8, deaths: 2, cash: 900, pingMs: 40 },
        ]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);

    const rows = await db.select().from(gameEvents).where(eq(gameEvents.serverId, server.id));
    expect(rows.filter((row) => row.type === "PlayerKilled")).toHaveLength(0);
    expect(rows.filter((row) => row.type === "PlayerDeath")).toHaveLength(0);
  });

  it("records FactionScoreChanged/FactionTookLead across a tie, keeping the lead sticky through it", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture({
          factionScores: [
            { name: "Lonestar", colorHex: "#ff0000", score: 0 },
            { name: "Valkyra", colorHex: "#0000ff", score: 0 },
          ],
        }),
        players: playersFixture([]),
      },
      {
        // Lonestar takes sole lead
        status: statusFixture({
          factionScores: [
            { name: "Lonestar", colorHex: "#ff0000", score: 10 },
            { name: "Valkyra", colorHex: "#0000ff", score: 0 },
          ],
        }),
        players: playersFixture([]),
      },
      {
        // Valkyra ties - must not reset who's "leading"
        status: statusFixture({
          factionScores: [
            { name: "Lonestar", colorHex: "#ff0000", score: 10 },
            { name: "Valkyra", colorHex: "#0000ff", score: 10 },
          ],
        }),
        players: playersFixture([]),
      },
      {
        // Valkyra overtakes the tie to take sole lead
        status: statusFixture({
          factionScores: [
            { name: "Lonestar", colorHex: "#ff0000", score: 10 },
            { name: "Valkyra", colorHex: "#0000ff", score: 12 },
          ],
        }),
        players: playersFixture([]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id); // 0-0, opens the Match, no diff
    await pollAndPersistSnapshot(db, client, server.id); // Lonestar 0->10, takes the lead
    await pollAndPersistSnapshot(db, client, server.id); // Valkyra 0->10, ties - no lead change
    await pollAndPersistSnapshot(db, client, server.id); // Valkyra 10->12, overtakes the tie

    const rows = await db
      .select()
      .from(gameEvents)
      .where(eq(gameEvents.serverId, server.id))
      .orderBy(gameEvents.id);
    const scoreChanged = rows.filter((row) => row.type === "FactionScoreChanged");
    const tookLead = rows.filter((row) => row.type === "FactionTookLead");

    expect(scoreChanged).toHaveLength(3);
    expect(scoreChanged.map((row) => row.metadata)).toEqual(
      expect.arrayContaining([
        { previousScore: 0, newScore: 10 },
        { previousScore: 0, newScore: 10 },
        { previousScore: 10, newScore: 12 },
      ]),
    );
    expect(tookLead).toEqual([
      expect.objectContaining({ faction: "Lonestar" }),
      expect.objectContaining({ faction: "Valkyra" }),
    ]);
  });

  it("does not fire FactionTookLead when a Match's boundary Snapshot already shows a non-tied spread", async () => {
    // Nothing enforces that faction scores reset to 0-0 at a Match
    // boundary (detectMatchBoundary never checks them), so the boundary
    // Snapshot itself can already have one Faction ahead. The first real
    // diff after it must not misreport that pre-existing leader as
    // "taking" a lead it already held.
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture({
          factionScores: [
            { name: "Lonestar", colorHex: "#ff0000", score: 10 },
            { name: "Valkyra", colorHex: "#0000ff", score: 0 },
          ],
        }),
        players: playersFixture([]),
      },
      {
        // unchanged - Lonestar was already leading before this diff ever ran
        status: statusFixture({
          factionScores: [
            { name: "Lonestar", colorHex: "#ff0000", score: 10 },
            { name: "Valkyra", colorHex: "#0000ff", score: 0 },
          ],
        }),
        players: playersFixture([]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id); // boundary: opens the Match, no diff
    await pollAndPersistSnapshot(db, client, server.id); // unchanged scores, first real diff

    const rows = await db.select().from(gameEvents).where(eq(gameEvents.serverId, server.id));
    expect(rows.filter((row) => row.type === "FactionTookLead")).toHaveLength(0);
    expect(rows.filter((row) => row.type === "FactionScoreChanged")).toHaveLength(0);
  });

  it("never creates duplicate PlayerKilled rows when the same computed event is persisted twice", async () => {
    const server = await seedServer();
    const [match] = await db
      .insert(matches)
      .values({
        serverId: server.id,
        map: "Sandstorm",
        experiences: ["TeamDeathmatch"],
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
      })
      .returning();

    const drafts = diffKillDeathGameEvents(
      [player({ steamId: "1", kills: 2 })],
      [player({ steamId: "1", kills: 3 })],
      context({ serverId: server.id, matchId: match.id, sourceSnapshotId: 1 }),
    );

    await db.insert(gameEvents).values(drafts).onConflictDoNothing({ target: gameEvents.idempotencyKey });
    await db.insert(gameEvents).values(drafts).onConflictDoNothing({ target: gameEvents.idempotencyKey });

    const rows = await db.select().from(gameEvents).where(eq(gameEvents.serverId, server.id));
    expect(rows).toHaveLength(1);
  });

  it("builds a currentKillStreak durably in playerCareerStats, firing Started then Increased", async () => {
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
      {
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 3, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id); // Alice joins, opens the Match
    await pollAndPersistSnapshot(db, client, server.id); // kill 1: streak 0 -> 1
    await pollAndPersistSnapshot(db, client, server.id); // kills 2, 3: streak 1 -> 2 -> 3

    const rows = await db.select().from(gameEvents).where(eq(gameEvents.serverId, server.id));
    expect(rows.filter((row) => row.type === "PlayerKillStreakStarted")).toHaveLength(1);
    expect(rows.filter((row) => row.type === "PlayerKillStreakIncreased")).toHaveLength(2);

    const [career] = await db.select().from(playerCareerStats).where(eq(playerCareerStats.steamId, "1"));
    expect(career).toMatchObject({ currentKillStreak: 3, highestKillStreak: 3 });
  });

  it("breaks the streak on a death, persisting currentKillStreak to 0 while keeping highestKillStreak", async () => {
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
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 2, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
      {
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 2, deaths: 1, cash: 0, pingMs: 40 },
        ]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id); // streak -> 2
    await pollAndPersistSnapshot(db, client, server.id); // death breaks it

    const rows = await db.select().from(gameEvents).where(eq(gameEvents.serverId, server.id));
    expect(rows.filter((row) => row.type === "PlayerKillStreakBroken")).toEqual([
      expect.objectContaining({ type: "PlayerKillStreakBroken", steamId: "1", metadata: { streak: 2 } }),
    ]);

    const [career] = await db.select().from(playerCareerStats).where(eq(playerCareerStats.steamId, "1"));
    expect(career).toMatchObject({ currentKillStreak: 0, highestKillStreak: 2 });
  });

  it("resets currentKillStreak to 0 for every player when a new Match starts, even mid-streak", async () => {
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
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 2, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
      {
        // map change closes the Match while Alice is still mid-streak -
        // never having died, so only a Match boundary resets her streak.
        status: statusFixture({ map: "Deadcity" }),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 2, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id); // streak -> 2

    const [beforeBoundary] = await db.select().from(playerCareerStats).where(eq(playerCareerStats.steamId, "1"));
    expect(beforeBoundary.currentKillStreak).toBe(2);

    await pollAndPersistSnapshot(db, client, server.id); // boundary: closes the Match, opens a new one

    const [afterBoundary] = await db.select().from(playerCareerStats).where(eq(playerCareerStats.steamId, "1"));
    expect(afterBoundary.currentKillStreak).toBe(0);
    expect(afterBoundary.highestKillStreak).toBe(2);
  });

  it("preserves an in-progress streak across a simulated worker restart (a fresh Database connection)", async () => {
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
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 2, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id); // streak -> 2, persisted to playerCareerStats

    // A fresh Database connection with no in-memory state of its own,
    // standing in for the worker process restarting - ingestSnapshot must
    // read the in-progress streak back from the database rather than
    // rebuild it from scratch.
    const restartedDb: Database = createDb(process.env.DATABASE_URL!);
    try {
      const restartedClient = scriptedRconClient([
        {
          status: statusFixture(),
          players: playersFixture([
            { steamId: "1", name: "Alice", faction: "Lonestar", kills: 2, deaths: 0, cash: 0, pingMs: 40 },
          ]),
        },
        {
          status: statusFixture(),
          players: playersFixture([
            { steamId: "1", name: "Alice", faction: "Lonestar", kills: 3, deaths: 0, cash: 0, pingMs: 40 },
          ]),
        },
      ]);

      await pollAndPersistSnapshot(restartedDb, restartedClient, server.id); // resumes, unchanged roster
      await pollAndPersistSnapshot(restartedDb, restartedClient, server.id); // streak -> 3

      const [career] = await restartedDb
        .select()
        .from(playerCareerStats)
        .where(eq(playerCareerStats.steamId, "1"));
      expect(career).toMatchObject({ currentKillStreak: 3, highestKillStreak: 3 });

      const rows = await restartedDb.select().from(gameEvents).where(eq(gameEvents.serverId, server.id));
      expect(rows.filter((row) => row.type === "PlayerKillStreakIncreased")).toHaveLength(2);
    } finally {
      await restartedDb.$client.end();
    }
  });
});
