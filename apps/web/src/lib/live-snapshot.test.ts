import {
  challengeDefinitions,
  challengeInstances,
  createDb,
  gameEvents,
  latestSnapshots,
  matches,
  playerCareerStats,
  notifications,
  servers,
  steamProfiles,
  type Database,
} from "@wdza-stats/db";
import { inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { getLiveSnapshot } from "./live-snapshot";
import { snapshotFixture } from "./live-snapshot-fixture";

const db: Database = createDb(process.env.DATABASE_URL!);

// challengeDefinitions is shared, migration-seeded config (see schema.ts) -
// other suites rely on those default rows staying in place, so this file's
// own throwaway definition is tracked here and deleted by id rather than
// blanket-deleting the whole table.
const insertedDefinitionIds: number[] = [];

afterEach(async () => {
  await db.delete(notifications);
  await db.delete(gameEvents);
  await db.delete(matches);
  await db.delete(challengeInstances);
  if (insertedDefinitionIds.length > 0) {
    await db.delete(challengeDefinitions).where(inArray(challengeDefinitions.id, insertedDefinitionIds));
    insertedDefinitionIds.length = 0;
  }
  await db.delete(latestSnapshots);
  await db.delete(servers);
  await db.delete(steamProfiles);
});

afterAll(async () => {
  await db.$client.end();
});

describe("getLiveSnapshot", () => {
  it("returns null when no Server is seeded for the given baseUrl", async () => {
    const result = await getLiveSnapshot(db, "http://unknown.test:9006");

    expect(result).toBeNull();
  });

  it("returns null when the Server has no Snapshot yet", async () => {
    await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: "http://rcon.test:9006" });

    const result = await getLiveSnapshot(db, "http://rcon.test:9006");

    expect(result).toBeNull();
  });

  it("returns the Server's name and latest Snapshot payload, with no avatar for a player with no cached SteamProfile", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: "http://rcon.test:9006" })
      .returning();
    const capturedAt = new Date("2026-01-01T00:00:00.000Z");
    const snapshot = snapshotFixture({ map: "Deadcity" });
    await db
      .insert(latestSnapshots)
      .values({ serverId: server.id, capturedAt, payload: snapshot });

    const result = await getLiveSnapshot(db, "http://rcon.test:9006");

    expect(result).toEqual({
      serverName: "WDZA Test",
      capturedAt: capturedAt.toISOString(),
      snapshot: {
        ...snapshot,
        players: snapshot.players.map((player) => ({ ...player, avatarUrl: null, level: null })),
      },
      activeChallenges: [],
      recentNotifications: [],
    });
  });

  it("joins in each online player's cached Steam avatar", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: "http://rcon.test:9006" })
      .returning();
    const capturedAt = new Date("2026-01-01T00:00:00.000Z");
    const snapshot = snapshotFixture({
      players: [
        {
          steamId: "1",
          displayName: "Alice",
          faction: "Lonestar",
          kills: 3,
          deaths: 1,
          cash: 500,
          ping: 40,
        },
      ],
    });
    await db
      .insert(latestSnapshots)
      .values({ serverId: server.id, capturedAt, payload: snapshot });
    await db.insert(steamProfiles).values({
      steamId: "1",
      personaName: "Alice",
      avatarUrl: "https://avatars.steamstatic.com/alice.jpg",
      achievements: [],
      playtimeMinutes: null,
      status: "ok",
      fetchedAt: new Date(),
    });

    const result = await getLiveSnapshot(db, "http://rcon.test:9006");

    expect(result?.snapshot.players).toEqual([
      {
        ...snapshot.players[0],
        avatarUrl: "https://avatars.steamstatic.com/alice.jpg",
        level: null,
      },
    ]);
  });

  it("joins in each online player's level derived from career XP, and null without a PlayerCareerStat", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: "http://rcon.test:9006" })
      .returning();
    const snapshot = snapshotFixture({
      players: ["1", "2"].map((steamId) => ({
        steamId,
        displayName: `Player ${steamId}`,
        faction: "Lonestar",
        kills: 0,
        deaths: 0,
        cash: 0,
        ping: 40,
      })),
    });
    await db.insert(latestSnapshots).values({
      serverId: server.id,
      capturedAt: new Date("2026-01-01T00:00:00.000Z"),
      payload: snapshot,
    });
    await db
      .insert(playerCareerStats)
      .values({ serverId: server.id, steamId: "1", displayName: "Player 1", xp: 0 });

    const result = await getLiveSnapshot(db, "http://rcon.test:9006");

    // Level 1 is always seeded at 0 XP.
    expect(result?.snapshot.players.map((player) => player.level)).toEqual([1, null]);
  });

  it("includes the Server's active daily challenges and recent Notifications, scoped to the Snapshot's own capturedAt", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: "http://rcon.test:9006" })
      .returning();
    const capturedAt = new Date("2026-03-05T12:00:00.000Z");
    await db
      .insert(latestSnapshots)
      .values({ serverId: server.id, capturedAt, payload: snapshotFixture({}) });

    const [definition] = await db
      .insert(challengeDefinitions)
      .values({ type: "kills", scope: "daily", target: 20, xpReward: 150 })
      .returning();
    insertedDefinitionIds.push(definition.id);
    await db
      .insert(challengeInstances)
      .values({ definitionId: definition.id, serverId: server.id, periodKey: "2026-03-05" });

    const [match] = await db
      .insert(matches)
      .values({ serverId: server.id, map: "Sandstorm", experiences: ["TeamDeathmatch"], startedAt: capturedAt })
      .returning();
    const [event] = await db
      .insert(gameEvents)
      .values({
        serverId: server.id,
        matchId: match.id,
        type: "MatchStarted",
        timestamp: capturedAt,
        idempotencyKey: "live-snapshot-test-match-started",
        sourceSnapshotId: 0,
      })
      .returning();
    await db.insert(notifications).values({
      serverId: server.id,
      priority: "high",
      message: "Match started on Sandstorm",
      eventId: event.id,
      timestamp: capturedAt,
    });

    const result = await getLiveSnapshot(db, "http://rcon.test:9006");

    expect(result?.activeChallenges).toEqual([
      expect.objectContaining({ type: "kills", target: 20, xpReward: 150 }),
    ]);
    expect(result?.recentNotifications).toEqual([
      expect.objectContaining({ message: "Match started on Sandstorm" }),
    ]);
  });
});
