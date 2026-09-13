import {
  createDb,
  latestSnapshots,
  matchSnapshots,
  matches,
  playerCareerStats,
  playerMatchStats,
  servers,
  type Database,
  type Snapshot,
  type SnapshotPlayer,
} from "@wdza-stats/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
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
    expect(career).toEqual([
      {
        serverId: server.id,
        steamId: "1",
        displayName: "AliceRenamed",
        kills: 5,
        deaths: 1,
        cash: 300,
        matchesPlayed: 2,
      },
    ]);
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
