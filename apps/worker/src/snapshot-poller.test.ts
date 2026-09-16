import {
  challengeCompletions,
  challengeInstances,
  createDb,
  gameEvents,
  latestSnapshots,
  matchSnapshots,
  matches,
  notifications,
  playerAchievements,
  playerCareerStats,
  playerChallengeProgress,
  playerMatchStats,
  servers,
  steamProfiles,
  xpTransactions,
  type Database,
} from "@wdza-stats/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { RawStatusResponse, RconClient } from "./rcon-client";
import {
  playersFixture,
  scriptedRconClient,
  statusFixture,
} from "./rcon-fixture";
import { pollAndPersistSnapshot, pollOnce } from "./snapshot-poller";
import { scriptedSteamClient } from "./steam-fixture";

const STEAM_APP_ID = 1867240;

const db: Database = createDb(process.env.DATABASE_URL!);

async function seedServer() {
  const [server] = await db
    .insert(servers)
    .values({
      name: "Test Server",
      baseUrl: `http://rcon-snapshot-poller-${crypto.randomUUID()}.test:9006`,
    })
    .returning();
  return server;
}

afterEach(async () => {
  vi.restoreAllMocks();
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
  await db.delete(steamProfiles);
});

afterAll(async () => {
  await db.$client.end();
});

describe("pollAndPersistSnapshot", () => {
  it("persists the merged Snapshot, overwriting the prior one on each poll", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture({ map: "Sandstorm" }),
        players: playersFixture([
          {
            steamId: "1",
            name: "Alice",
            faction: "Lonestar",
            kills: 3,
            deaths: 1,
            cash: 500,
            pingMs: 40,
          },
        ]),
      },
      {
        status: statusFixture({
          map: "Deadcity",
          rotation: { nowIndex: 1, entries: [{ map: "Sandstorm" }, { map: "Deadcity" }] },
        }),
        players: playersFixture([
          {
            steamId: "1",
            name: "Alice",
            faction: "Valkyra",
            kills: 5,
            deaths: 2,
            cash: 700,
            pingMs: 35,
          },
        ]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);
    await pollAndPersistSnapshot(db, client, server.id);

    const rows = await db
      .select()
      .from(latestSnapshots)
      .where(eq(latestSnapshots.serverId, server.id));

    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({
      map: "Deadcity",
      rotation: { nowIndex: 1, entries: [{ map: "Sandstorm" }, { map: "Deadcity" }] },
      players: [
        {
          steamId: "1",
          displayName: "Alice",
          faction: "Valkyra",
          kills: 5,
          deaths: 2,
          cash: 700,
          ping: 35,
        },
      ],
    });
  });

  it("logs a summary line on every poll, even with nothing else to report", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture({ map: "Sandstorm" }),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);

    expect(logSpy).toHaveBeenCalledWith("[worker] poll: 1 player(s) online, map=Sandstorm");
    logSpy.mockRestore();
  });

  it("persists an empty rotation entries list when the RCON server omits it", async () => {
    const server = await seedServer();
    const rawStatus = statusFixture({ map: "Sandstorm" });
    delete (rawStatus.rotation as { entries?: unknown }).entries;
    const client = scriptedRconClient([
      { status: rawStatus, players: playersFixture([]) },
    ]);

    await pollAndPersistSnapshot(db, client, server.id);

    const rows = await db
      .select()
      .from(latestSnapshots)
      .where(eq(latestSnapshots.serverId, server.id));

    expect(rows[0].payload).toMatchObject({
      rotation: { nowIndex: 0, entries: [] },
    });
  });
});

describe("pollOnce", () => {
  it("logs and does not throw when the RCON client fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const server = await seedServer();
    const failingClient: RconClient = {
      fetchStatus: () => Promise.reject(new Error("network error")),
      fetchPlayers: () => Promise.reject(new Error("network error")),
    };

    await expect(pollOnce(db, failingClient, server.id)).resolves.toBeUndefined();

    const rows = await db
      .select()
      .from(latestSnapshots)
      .where(eq(latestSnapshots.serverId, server.id));
    expect(rows).toHaveLength(0);
  });

  it("recovers and persists on the next poll after a failed one", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const server = await seedServer();

    let attempt = 0;
    const client: RconClient = {
      fetchStatus: async () => {
        attempt++;
        if (attempt === 1) {
          throw new Error("network error");
        }
        return statusFixture({ map: "Deadcity" });
      },
      fetchPlayers: async () => playersFixture([]),
    };

    await pollOnce(db, client, server.id);
    await pollOnce(db, client, server.id);

    const rows = await db
      .select()
      .from(latestSnapshots)
      .where(eq(latestSnapshots.serverId, server.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({ map: "Deadcity" });
  });
});

describe("pollAndPersistSnapshot with Steam enrichment", () => {
  it("triggers exactly one batched summaries call for a poll's new roster member", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture({ map: "Sandstorm" }),
        players: playersFixture([
          {
            steamId: "76561198000000001",
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
    const steamClient = scriptedSteamClient({
      summaries: {
        "76561198000000001": {
          steamId: "76561198000000001",
          personaName: "Alice",
          avatarUrl: "https://example.com/a.jpg", countryCode: null,
        },
      },
      achievements: { "76561198000000001": { available: true, achievements: [] } },
    });

    await pollAndPersistSnapshot(db, client, server.id, {
      client: steamClient,
      appId: STEAM_APP_ID,
    });

    expect(steamClient.summariesCalls).toEqual([["76561198000000001"]]);
    const [profile] = await db
      .select()
      .from(steamProfiles)
      .where(eq(steamProfiles.steamId, "76561198000000001"));
    expect(profile).toMatchObject({ personaName: "Alice", status: "ok" });
  });

  it("does not throw and still persists the Snapshot when the Steam client fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture({ map: "Sandstorm" }),
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
    const steamClient = scriptedSteamClient({
      failSummaries: () => new Error("network error"),
    });

    await expect(
      pollAndPersistSnapshot(db, client, server.id, { client: steamClient, appId: STEAM_APP_ID }),
    ).resolves.toBeUndefined();

    const rows = await db
      .select()
      .from(latestSnapshots)
      .where(eq(latestSnapshots.serverId, server.id));
    expect(rows).toHaveLength(1);
  });
});

describe("pollAndPersistSnapshot playtime-on-join refresh", () => {
  it("re-fetches playtime for an already-cached player who joins, but not while they stay online", async () => {
    const server = await seedServer();
    await db.insert(steamProfiles).values({
      steamId: "1",
      personaName: "Alice",
      avatarUrl: null,
      achievements: [],
      playtimeMinutes: 100,
      status: "ok",
      fetchedAt: new Date(),
    });

    const alicePlayer = {
      steamId: "1",
      name: "Alice",
      faction: "Lonestar",
      kills: 0,
      deaths: 0,
      cash: 0,
      pingMs: 40,
    };
    const client = scriptedRconClient([
      { status: statusFixture(), players: playersFixture([alicePlayer]) },
      { status: statusFixture(), players: playersFixture([alicePlayer]) },
    ]);
    const steamClient = scriptedSteamClient({ playtimeMinutes: { "1": 200 } });

    // First poll ever for this Server: no previous roster to compare
    // against, so Alice counts as "joined" and her playtime is refreshed.
    await pollAndPersistSnapshot(db, client, server.id, { client: steamClient, appId: STEAM_APP_ID });
    expect(steamClient.playtimeCalls).toEqual(["1"]);

    // Second poll: Alice is still online, not newly joined - no extra call.
    await pollAndPersistSnapshot(db, client, server.id, { client: steamClient, appId: STEAM_APP_ID });
    expect(steamClient.playtimeCalls).toEqual(["1"]);

    const row = await db.select().from(steamProfiles).where(eq(steamProfiles.steamId, "1"));
    expect(row[0]).toMatchObject({ playtimeMinutes: 200 });
  });

  it("re-fetches playtime for a second player only once they actually join", async () => {
    const server = await seedServer();
    await db.insert(steamProfiles).values([
      { steamId: "1", personaName: "Alice", avatarUrl: null, achievements: [], playtimeMinutes: 100, status: "ok", fetchedAt: new Date() },
      { steamId: "2", personaName: "Bob", avatarUrl: null, achievements: [], playtimeMinutes: 50, status: "ok", fetchedAt: new Date() },
    ]);

    const alicePlayer = { steamId: "1", name: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, pingMs: 40 };
    const bobPlayer = { steamId: "2", name: "Bob", faction: "Valkyra", kills: 0, deaths: 0, cash: 0, pingMs: 40 };
    const client = scriptedRconClient([
      { status: statusFixture(), players: playersFixture([alicePlayer]) },
      { status: statusFixture(), players: playersFixture([alicePlayer, bobPlayer]) },
    ]);
    const steamClient = scriptedSteamClient({ playtimeMinutes: { "1": 200, "2": 300 } });

    await pollAndPersistSnapshot(db, client, server.id, { client: steamClient, appId: STEAM_APP_ID });
    expect(steamClient.playtimeCalls).toEqual(["1"]);

    // Bob joins on this poll; Alice was already online, not rejoining.
    await pollAndPersistSnapshot(db, client, server.id, { client: steamClient, appId: STEAM_APP_ID });
    expect(steamClient.playtimeCalls).toEqual(["1", "2"]);
  });

  it("does not double-fetch playtime for a brand-new player's first sighting", async () => {
    const server = await seedServer();
    const client = scriptedRconClient([
      {
        status: statusFixture(),
        players: playersFixture([
          { steamId: "1", name: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, pingMs: 40 },
        ]),
      },
    ]);
    const steamClient = scriptedSteamClient({
      summaries: { "1": { steamId: "1", personaName: "Alice", avatarUrl: "https://example.com/a.jpg", countryCode: null } },
      achievements: { "1": { available: true, achievements: [] } },
      playtimeMinutes: { "1": 200 },
    });

    await pollAndPersistSnapshot(db, client, server.id, { client: steamClient, appId: STEAM_APP_ID });

    // refreshPlaytimeOnJoin skips steamId "1" (no row exists yet before this
    // poll); refreshUnseenSteamProfiles fetches its playtime once while
    // creating the row - exactly one call in total, not two.
    expect(steamClient.playtimeCalls).toEqual(["1"]);
  });
});
