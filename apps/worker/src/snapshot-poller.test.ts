import {
  createDb,
  latestSnapshots,
  matchSnapshots,
  matches,
  playerCareerStats,
  playerMatchStats,
  servers,
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
        status: statusFixture({ map: "Deadcity" }),
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
