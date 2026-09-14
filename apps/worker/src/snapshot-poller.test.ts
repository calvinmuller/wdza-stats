import {
  createDb,
  latestSnapshots,
  matchSnapshots,
  matches,
  playerCareerStats,
  playerMatchStats,
  servers,
  steamProfiles,
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
          avatarUrl: "https://example.com/a.jpg",
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
