import { createDb, latestSnapshots, servers, type Database } from "@wdza-stats/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type {
  RawPlayersResponse,
  RawStatusResponse,
  RconClient,
} from "./rcon-client";
import { pollAndPersistSnapshot, pollOnce } from "./snapshot-poller";

const db: Database = createDb(process.env.DATABASE_URL!);

function statusFixture(
  overrides: Partial<RawStatusResponse> = {},
): RawStatusResponse {
  return {
    map: "Sandstorm",
    lighting: "Day",
    alternator: "None",
    rotation: { nowIndex: 0 },
    experiences: ["TeamDeathmatch"],
    factions: [
      { name: "Lonestar", color: "#ff0000", score: 10 },
      { name: "Valkyra", color: "#0000ff", score: 8 },
    ],
    ...overrides,
  };
}

function playersFixture(
  players: RawPlayersResponse["players"] = [],
): RawPlayersResponse {
  return { players };
}

// Test-only seam: a fake RCON client fed a scripted sequence of raw
// responses, so ingestion runs for real without hitting the network.
function scriptedRconClient(
  script: Array<{ status: RawStatusResponse; players: RawPlayersResponse }>,
): RconClient {
  let index = 0;
  return {
    async fetchStatus() {
      return script[index].status;
    },
    async fetchPlayers() {
      const entry = script[index];
      index = Math.min(index + 1, script.length - 1);
      return entry.players;
    },
  };
}

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
            displayName: "Alice",
            faction: "Lonestar",
            kills: 3,
            deaths: 1,
            cash: 500,
            ping: 40,
          },
        ]),
      },
      {
        status: statusFixture({ map: "Deadcity" }),
        players: playersFixture([
          {
            steamId: "1",
            displayName: "Alice",
            faction: "Valkyra",
            kills: 5,
            deaths: 2,
            cash: 700,
            ping: 35,
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
