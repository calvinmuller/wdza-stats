import {
  createDb,
  gameEvents,
  latestSnapshots,
  matchSnapshots,
  matches,
  playerCareerStats,
  playerMatchStats,
  servers,
  type Database,
  type SnapshotPlayer,
} from "@wdza-stats/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  diffKillDeathGameEvents,
  diffRosterGameEvents,
  matchLifecycleEvent,
  type RosterDiffContext,
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

function context(overrides: Partial<RosterDiffContext> = {}): RosterDiffContext {
  return {
    serverId: 1,
    matchId: 1,
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
    sourceSnapshotId: 1,
    ...overrides,
  };
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
    await db.delete(gameEvents);
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
});
