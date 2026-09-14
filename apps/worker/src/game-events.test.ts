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
import { diffRosterGameEvents, type RosterDiffContext } from "./game-events";
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
    expect(rows).toEqual([
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
    // joined - see diffRosterGameEvents' "missing previous roster" case.
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "PlayerJoined", steamId: "1" }),
        expect.objectContaining({ type: "PlayerLeft", steamId: "1", faction: "Lonestar" }),
      ]),
    );
    expect(rows).toHaveLength(2);
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
});
