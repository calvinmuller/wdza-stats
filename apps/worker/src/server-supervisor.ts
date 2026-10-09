import { listenTo, SERVERS_CHANGED_CHANNEL, servers, type Database } from "@wdza-stats/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { createRconClient, type RconClient } from "./rcon-client";
import { startSnapshotPolling, type SteamRefreshConfig } from "./snapshot-poller";

/** The RconClient for a Server this Worker is polling right now, if it is. */
export type RconClientFor = (serverId: number) => RconClient | undefined;

export interface ServerSupervisorOptions {
  pollIntervalMs: number;
  steamConfig?: SteamRefreshConfig;
  // Seams for tests; production uses the real RCON client and poller.
  createClient?: (baseUrl: string, token: string) => RconClient;
  startPolling?: typeof startSnapshotPolling;
}

export interface ServerSupervisor {
  /** Brings the running pollers in line with the servers table. */
  reconcile(): Promise<void>;
  clientFor: RconClientFor;
  /** Ids of the Servers being polled right now. */
  polledServerIds(): number[];
  /** Stops every poller. */
  stop(): void;
}

interface Running {
  baseUrl: string;
  rconToken: string;
  client: RconClient;
  poller: NodeJS.Timeout;
}

/**
 * Keeps one snapshot poller running per Server an admin has enabled and given
 * an RCON token (docs/adr/0011). A Server whose URL or token changes is
 * restarted with a fresh client; one that is disabled, or loses its token,
 * is stopped. Its rows stay put either way.
 */
export function createServerSupervisor(db: Database, options: ServerSupervisorOptions): ServerSupervisor {
  const createClient = options.createClient ?? createRconClient;
  const startPolling = options.startPolling ?? startSnapshotPolling;
  const running = new Map<number, Running>();

  function stopOne(serverId: number) {
    const current = running.get(serverId);
    if (!current) return;
    clearInterval(current.poller);
    running.delete(serverId);
  }

  async function reconcileNow() {
    const wanted = await db
      .select({ id: servers.id, name: servers.name, baseUrl: servers.baseUrl, rconToken: servers.rconToken })
      .from(servers)
      .where(and(eq(servers.enabled, true), isNotNull(servers.rconToken)));
    const wantedIds = new Set(wanted.map((server) => server.id));

    for (const serverId of [...running.keys()]) {
      if (wantedIds.has(serverId)) continue;
      stopOne(serverId);
      console.log(`[worker] stopped polling server ${serverId}`);
    }

    for (const server of wanted) {
      const rconToken = server.rconToken!;
      const current = running.get(server.id);
      if (current && current.baseUrl === server.baseUrl && current.rconToken === rconToken) continue;
      stopOne(server.id);

      const client = createClient(server.baseUrl, rconToken);
      const poller = startPolling(db, client, server.id, options.pollIntervalMs, options.steamConfig);
      running.set(server.id, { baseUrl: server.baseUrl, rconToken, client, poller });
      console.log(
        `[worker] ${current ? "restarted" : "started"} polling "${server.name}" every ${options.pollIntervalMs / 1000}s`,
      );
    }
  }

  // Chained so a notification arriving mid-reconcile can't start a second
  // poller for the same Server.
  let pending = Promise.resolve();

  return {
    reconcile() {
      pending = pending.then(reconcileNow, reconcileNow);
      return pending;
    },
    clientFor: (serverId) => running.get(serverId)?.client,
    polledServerIds: () => [...running.keys()],
    stop() {
      for (const serverId of [...running.keys()]) stopOne(serverId);
    },
  };
}

/**
 * Runs a ServerSupervisor for the life of the Worker: reconciles at once, on
 * every servers_changed notification from /admin/servers, and every
 * `reconcileIntervalMs` in case a notification was missed. `ready` resolves
 * once the first reconcile is done and the LISTEN is active.
 */
export function startServerSupervisor(
  db: Database,
  connectionString: string,
  reconcileIntervalMs: number,
  options: ServerSupervisorOptions,
): ServerSupervisor & { ready: Promise<void> } {
  const supervisor = createServerSupervisor(db, options);
  const reconcile = () =>
    supervisor.reconcile().catch((error) => {
      console.error("[worker] reading the servers table failed:", error);
    });

  const listener = listenTo(connectionString, SERVERS_CHANGED_CHANNEL, () => void reconcile(), () => void reconcile());
  const interval = setInterval(() => void reconcile(), reconcileIntervalMs);

  return {
    ...supervisor,
    ready: Promise.all([supervisor.reconcile(), listener.ready]).then(() => undefined),
    stop() {
      clearInterval(interval);
      void listener.stop();
      supervisor.stop();
    },
  };
}
