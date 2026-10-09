import { createDb, servers, type Database } from "@wdza-stats/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { RconClient } from "./rcon-client";
import { createServerSupervisor } from "./server-supervisor";

const db: Database = createDb(process.env.DATABASE_URL!);

afterEach(async () => {
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

// Records which Servers were started with which URL and token, without
// polling anything.
function fakeSupervisor() {
  const started: Array<{ serverId: number; baseUrl: string; token: string }> = [];
  const clients = new Map<RconClient, { baseUrl: string; token: string }>();
  const supervisor = createServerSupervisor(db, {
    pollIntervalMs: 60_000,
    createClient: (baseUrl, token) => {
      const client = {} as RconClient;
      clients.set(client, { baseUrl, token });
      return client;
    },
    startPolling: vi.fn((_db, client, serverId) => {
      started.push({ serverId, ...clients.get(client)! });
      return setInterval(() => {}, 60_000);
    }),
  });
  return { supervisor, started };
}

async function seedServer(values: Partial<typeof servers.$inferInsert> = {}) {
  const [server] = await db
    .insert(servers)
    .values({
      name: "Test Server",
      baseUrl: `http://rcon-supervisor-${crypto.randomUUID()}.test:9006`,
      rconToken: "token",
      ...values,
    })
    .returning();
  return server;
}

describe("createServerSupervisor", () => {
  it("polls every enabled Server that has an RCON token, and no other", async () => {
    const polled = await seedServer();
    await seedServer({ enabled: false });
    await seedServer({ rconToken: null });
    const { supervisor, started } = fakeSupervisor();

    await supervisor.reconcile();

    expect(started.map((entry) => entry.serverId)).toEqual([polled.id]);
    expect(supervisor.polledServerIds()).toEqual([polled.id]);
    expect(supervisor.clientFor(polled.id)).toBeDefined();
    supervisor.stop();
  });

  it("leaves a running Server alone when nothing about it changed", async () => {
    await seedServer();
    const { supervisor, started } = fakeSupervisor();

    await supervisor.reconcile();
    await supervisor.reconcile();

    expect(started).toHaveLength(1);
    supervisor.stop();
  });

  it("restarts a Server with its new token", async () => {
    const server = await seedServer({ rconToken: "old" });
    const { supervisor, started } = fakeSupervisor();
    await supervisor.reconcile();

    await db.update(servers).set({ rconToken: "new" }).where(eq(servers.id, server.id));
    await supervisor.reconcile();

    expect(started.map((entry) => entry.token)).toEqual(["old", "new"]);
    expect(supervisor.polledServerIds()).toEqual([server.id]);
    supervisor.stop();
  });

  it("stops polling a Server once it is disabled", async () => {
    const server = await seedServer();
    const { supervisor } = fakeSupervisor();
    await supervisor.reconcile();

    await db.update(servers).set({ enabled: false }).where(eq(servers.id, server.id));
    await supervisor.reconcile();

    expect(supervisor.polledServerIds()).toEqual([]);
    expect(supervisor.clientFor(server.id)).toBeUndefined();
  });
});
