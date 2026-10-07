import {
  bannedPlayers,
  createDb,
  currentSeason,
  gameEvents,
  latestSnapshots,
  matches,
  playerCareerStats,
  playerSeasonStats,
  seasons,
  servers,
  steamProfiles,
  type Database,
} from "@wdza-stats/db";
import { gt } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { snapshotFixture } from "./live-snapshot-fixture";
import { getMostActivePlayers } from "./most-active-players";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = "http://most-active-players.test:9006";

// Season 1 comes from the migration; tests add Seasons above it.
let baseline: number;

beforeAll(async () => {
  baseline = (await currentSeason(db)).number;
});

afterEach(async () => {
  await db.delete(gameEvents);
  await db.delete(playerSeasonStats);
  await db.delete(playerCareerStats);
  await db.delete(steamProfiles);
  await db.delete(bannedPlayers);
  await db.delete(matches);
  await db.delete(seasons).where(gt(seasons.number, baseline));
  await db.delete(latestSnapshots);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

async function seedServer() {
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
      startedAt: new Date("2030-01-01T00:00:00.000Z"),
    })
    .returning();
  return { server, match };
}

type Presence = ["PlayerJoined" | "PlayerLeft", string, string];

async function seedPresence(serverId: number, matchId: number, events: Presence[]) {
  await db.insert(gameEvents).values(
    events.map(([type, steamId, at]) => ({
      serverId,
      matchId,
      type,
      timestamp: new Date(at),
      steamId,
      sourceSnapshotId: 0,
      idempotencyKey: `${type}:${steamId}:${at}`,
    })),
  );
}

async function seedLatestSnapshot(serverId: number, capturedAt: string, onlineSteamIds: string[]) {
  await db.insert(latestSnapshots).values({
    serverId,
    capturedAt: new Date(capturedAt),
    payload: snapshotFixture({
      players: onlineSteamIds.map((steamId) => ({
        steamId,
        displayName: `Live ${steamId}`,
        faction: "Lonestar",
        kills: 0,
        deaths: 0,
        cash: 0,
        ping: 40,
      })),
    }),
  });
}

describe("getMostActivePlayers", () => {
  it("returns an empty list when the Server isn't seeded", async () => {
    expect(await getMostActivePlayers(db, BASE_URL)).toEqual([]);
  });

  it("sums each player's sessions and ranks the longest playtime first", async () => {
    const { server, match } = await seedServer();
    await seedLatestSnapshot(server.id, "2030-01-01T12:00:00.000Z", []);
    await seedPresence(server.id, match.id, [
      ["PlayerJoined", "1", "2030-01-01T00:00:00.000Z"],
      ["PlayerLeft", "1", "2030-01-01T01:00:00.000Z"],
      ["PlayerJoined", "2", "2030-01-01T00:00:00.000Z"],
      ["PlayerLeft", "2", "2030-01-01T01:00:00.000Z"],
      ["PlayerJoined", "2", "2030-01-01T02:00:00.000Z"],
      ["PlayerLeft", "2", "2030-01-01T02:30:00.000Z"],
    ]);
    await db.insert(playerCareerStats).values({
      serverId: server.id,
      steamId: "2",
      displayName: "Bob",
      kills: 7,
      deaths: 3,
    });

    const rows = await getMostActivePlayers(db, BASE_URL);

    expect(rows).toEqual([
      {
        steamId: "2",
        displayName: "Bob",
        playtimeSeconds: 5400,
        sessions: 2,
        kills: 7,
        deaths: 3,
        online: false,
        lastSeenAt: "2030-01-01T02:30:00.000Z",
      },
      expect.objectContaining({ steamId: "1", playtimeSeconds: 3600, sessions: 1 }),
    ]);
  });

  it("runs an online player's open session up to the latest Snapshot", async () => {
    const { server, match } = await seedServer();
    await seedLatestSnapshot(server.id, "2030-01-01T03:00:00.000Z", ["1"]);
    await seedPresence(server.id, match.id, [["PlayerJoined", "1", "2030-01-01T01:00:00.000Z"]]);

    const [row] = await getMostActivePlayers(db, BASE_URL);

    expect(row).toMatchObject({
      steamId: "1",
      displayName: "Live 1",
      playtimeSeconds: 7200,
      sessions: 1,
      online: true,
      lastSeenAt: "2030-01-01T03:00:00.000Z",
    });
  });

  it("ignores a PlayerLeft with no PlayerJoined before it", async () => {
    const { server, match } = await seedServer();
    await seedLatestSnapshot(server.id, "2030-01-01T12:00:00.000Z", []);
    await seedPresence(server.id, match.id, [
      ["PlayerLeft", "1", "2030-01-01T00:30:00.000Z"],
      ["PlayerJoined", "1", "2030-01-01T01:00:00.000Z"],
      ["PlayerLeft", "1", "2030-01-01T01:10:00.000Z"],
    ]);

    const [row] = await getMostActivePlayers(db, BASE_URL);

    expect(row).toMatchObject({ playtimeSeconds: 600, sessions: 1 });
  });

  it("leaves a polling gap out of playtime, and was last seen when the gap began", async () => {
    const { server, match } = await seedServer();
    // Polling stopped at 01:00 and resumed at 05:00; 01:00-01:00:15 is a normal boundary.
    await db.insert(matches).values([
      {
        serverId: server.id,
        map: "Foundry",
        experiences: [],
        startedAt: new Date("2030-01-01T00:10:00.000Z"),
        endedAt: new Date("2030-01-01T00:59:45.000Z"),
      },
      {
        serverId: server.id,
        map: "Sandstorm",
        experiences: [],
        startedAt: new Date("2030-01-01T01:00:00.000Z"),
        endedAt: new Date("2030-01-01T01:00:00.000Z"),
      },
      { serverId: server.id, map: "Deadcity", experiences: [], startedAt: new Date("2030-01-01T05:00:00.000Z") },
    ]);
    await seedLatestSnapshot(server.id, "2030-01-01T12:00:00.000Z", []);
    await seedPresence(server.id, match.id, [
      ["PlayerJoined", "1", "2030-01-01T00:30:00.000Z"],
      ["PlayerLeft", "1", "2030-01-01T05:00:00.000Z"],
      ["PlayerJoined", "2", "2030-01-01T05:00:00.000Z"],
      ["PlayerLeft", "2", "2030-01-01T05:10:00.000Z"],
    ]);

    const rows = await getMostActivePlayers(db, BASE_URL);

    expect(rows).toEqual([
      expect.objectContaining({
        steamId: "1",
        playtimeSeconds: 1800,
        sessions: 1,
        lastSeenAt: "2030-01-01T01:00:00.000Z",
      }),
      expect.objectContaining({ steamId: "2", playtimeSeconds: 600, lastSeenAt: "2030-01-01T05:10:00.000Z" }),
    ]);
  });

  it("prefers the PlayerCareerStat name, then the SteamProfile's", async () => {
    const { server, match } = await seedServer();
    await seedLatestSnapshot(server.id, "2030-01-01T12:00:00.000Z", []);
    await seedPresence(server.id, match.id, [
      ["PlayerJoined", "1", "2030-01-01T00:00:00.000Z"],
      ["PlayerLeft", "1", "2030-01-01T02:00:00.000Z"],
      ["PlayerJoined", "2", "2030-01-01T00:00:00.000Z"],
      ["PlayerLeft", "2", "2030-01-01T01:00:00.000Z"],
    ]);
    await db.insert(steamProfiles).values([
      { steamId: "1", personaName: "Steam Alice", achievements: [], status: "ok", fetchedAt: new Date() },
      { steamId: "2", personaName: "Steam Bob", achievements: [], status: "ok", fetchedAt: new Date() },
    ]);
    await db.insert(playerCareerStats).values({ serverId: server.id, steamId: "1", displayName: "Alice" });

    const rows = await getMostActivePlayers(db, BASE_URL);

    expect(rows.map((row) => row.displayName)).toEqual(["Alice", "Steam Bob"]);
  });

  it("leaves out banned players", async () => {
    const { server, match } = await seedServer();
    await seedLatestSnapshot(server.id, "2030-01-01T12:00:00.000Z", []);
    await seedPresence(server.id, match.id, [
      ["PlayerJoined", "1", "2030-01-01T00:00:00.000Z"],
      ["PlayerLeft", "1", "2030-01-01T01:00:00.000Z"],
      ["PlayerJoined", "2", "2030-01-01T00:00:00.000Z"],
      ["PlayerLeft", "2", "2030-01-01T01:00:00.000Z"],
    ]);
    await db.insert(bannedPlayers).values({ steamId: "2" });

    const rows = await getMostActivePlayers(db, BASE_URL);

    expect(rows.map((row) => row.steamId)).toEqual(["1"]);
  });

  it("returns at most `limit` players", async () => {
    const { server, match } = await seedServer();
    await seedLatestSnapshot(server.id, "2030-01-01T12:00:00.000Z", []);
    await seedPresence(server.id, match.id, [
      ["PlayerJoined", "1", "2030-01-01T00:00:00.000Z"],
      ["PlayerLeft", "1", "2030-01-01T03:00:00.000Z"],
      ["PlayerJoined", "2", "2030-01-01T00:00:00.000Z"],
      ["PlayerLeft", "2", "2030-01-01T02:00:00.000Z"],
      ["PlayerJoined", "3", "2030-01-01T00:00:00.000Z"],
      ["PlayerLeft", "3", "2030-01-01T01:00:00.000Z"],
    ]);

    const rows = await getMostActivePlayers(db, BASE_URL, { kind: "career" }, 2);

    expect(rows.map((row) => row.steamId)).toEqual(["1", "2"]);
  });

  it("splits a session that straddles a Season change between the two Seasons", async () => {
    const { server, match } = await seedServer();
    const [earlier, later] = await db
      .insert(seasons)
      .values([
        { number: baseline + 1, startedAt: new Date("2030-01-01T00:00:00.000Z") },
        { number: baseline + 2, startedAt: new Date("2030-01-02T00:00:00.000Z") },
      ])
      .returning();
    await seedLatestSnapshot(server.id, "2030-01-02T12:00:00.000Z", []);
    await seedPresence(server.id, match.id, [
      ["PlayerJoined", "1", "2030-01-01T23:00:00.000Z"],
      ["PlayerLeft", "1", "2030-01-02T01:00:00.000Z"],
      ["PlayerJoined", "2", "2030-01-02T02:00:00.000Z"],
      ["PlayerLeft", "2", "2030-01-02T02:30:00.000Z"],
    ]);
    await db.insert(playerCareerStats).values({
      serverId: server.id,
      steamId: "1",
      displayName: "Alice",
      kills: 10,
      deaths: 4,
    });
    await db.insert(playerSeasonStats).values([
      { seasonId: earlier.id, serverId: server.id, steamId: "1", kills: 6, deaths: 1, matchesPlayed: 1 },
      { seasonId: later.id, serverId: server.id, steamId: "1", kills: 4, deaths: 3, matchesPlayed: 1 },
    ]);

    const earlierRows = await getMostActivePlayers(db, BASE_URL, { kind: "season", season: earlier });
    expect(earlierRows).toEqual([
      expect.objectContaining({ steamId: "1", playtimeSeconds: 3600, sessions: 1, kills: 6, deaths: 1 }),
    ]);

    const laterRows = await getMostActivePlayers(db, BASE_URL, { kind: "season", season: later });
    expect(laterRows).toEqual([
      expect.objectContaining({ steamId: "1", playtimeSeconds: 3600, sessions: 1, kills: 4, deaths: 3 }),
      expect.objectContaining({ steamId: "2", playtimeSeconds: 1800, sessions: 1, kills: 0, deaths: 0 }),
    ]);

    const career = await getMostActivePlayers(db, BASE_URL);
    expect(career[0]).toMatchObject({ steamId: "1", playtimeSeconds: 7200, kills: 10, deaths: 4 });
  });
});
