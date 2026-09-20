import { listenTo, requireEnv, type Database } from "@wdza-stats/db";
import { sql } from "drizzle-orm";

// How a stored Kill reaches every open live stream, whichever web process the
// stream and the game's POST landed on (docs/adr/0004). Ingest NOTIFYs with
// just the Server's id; each process keeps one LISTEN connection and tells the
// streams watching that Server to read what is new.
const CHANNEL = "kills";

type Wake = () => void;

interface Listener {
  ready: Promise<void>;
  stop: () => Promise<void>;
  subscribers: Map<number, Set<Wake>>;
}

// On globalThis so dev-server module reloads don't leave a stray connection each time.
const holder = globalThis as unknown as { __killListener?: Listener };

function startListener(): Listener {
  const subscribers = new Map<number, Set<Wake>>();
  const wakeAll = (serverId?: number) => {
    for (const [id, wakes] of subscribers) {
      if (serverId === undefined || serverId === id)
        wakes.forEach((wake) => wake());
    }
  };
  const { ready, stop } = listenTo(
    requireEnv("DATABASE_URL"),
    CHANNEL,
    (payload) => wakeAll(Number(payload)),
    // After a reconnect notifications may have been missed: everyone re-reads.
    () => wakeAll(),
  );
  return { ready, stop, subscribers };
}

/** Tell every process's streams that this Server has new Kills. */
export async function notifyKills(
  db: Database,
  serverId: number,
): Promise<void> {
  await db.execute(sql`select pg_notify(${CHANNEL}, ${String(serverId)})`);
}

/**
 * Runs `wake` whenever this Server has new Kills. Resolves once the LISTEN is
 * active - anything stored after that is guaranteed to wake the caller - with
 * the function that unsubscribes.
 */
export async function subscribeToKills(
  serverId: number,
  wake: Wake,
): Promise<() => void> {
  const listener = (holder.__killListener ??= startListener());
  const wakes = listener.subscribers.get(serverId) ?? new Set<Wake>();
  listener.subscribers.set(serverId, wakes);
  wakes.add(wake);
  await listener.ready;
  return () => {
    wakes.delete(wake);
    if (wakes.size === 0) listener.subscribers.delete(serverId);
  };
}

/** Closes this process's LISTEN connection (shutdown, and tests). */
export async function stopKillListener(): Promise<void> {
  const listener = holder.__killListener;
  holder.__killListener = undefined;
  await listener?.stop();
}
