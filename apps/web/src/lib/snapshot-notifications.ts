import { listenTo, requireEnv, SNAPSHOT_CAPTURED_CHANNEL } from "@wdza-stats/db";

// How a Snapshot the Worker just stored reaches every homepage open on its
// Server, whichever web process the stream landed on - the same LISTEN/NOTIFY
// shape as kill-notifications.ts, woken by the Worker's poll instead of ingest.

type Wake = () => void;

interface Listener {
  ready: Promise<void>;
  stop: () => Promise<void>;
  subscribers: Map<number, Set<Wake>>;
}

// On globalThis so dev-server module reloads don't leave a stray connection each time.
const holder = globalThis as unknown as { __snapshotCapturedListener?: Listener };

function startListener(): Listener {
  const subscribers = new Map<number, Set<Wake>>();
  const wakeAll = (serverId?: number) => {
    for (const [id, wakes] of subscribers) {
      if (serverId === undefined || serverId === id) wakes.forEach((wake) => wake());
    }
  };
  const { ready, stop } = listenTo(
    requireEnv("DATABASE_URL"),
    SNAPSHOT_CAPTURED_CHANNEL,
    (payload) => wakeAll(Number(payload)),
    // After a reconnect notifications may have been missed: everyone re-reads.
    () => wakeAll(),
  );
  return { ready, stop, subscribers };
}

/**
 * Runs `wake` whenever this Server has a new latest Snapshot. Resolves once
 * the LISTEN is active, with the function that unsubscribes.
 */
export async function subscribeToSnapshots(serverId: number, wake: Wake): Promise<() => void> {
  const listener = (holder.__snapshotCapturedListener ??= startListener());
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
export async function stopSnapshotListener(): Promise<void> {
  const listener = holder.__snapshotCapturedListener;
  holder.__snapshotCapturedListener = undefined;
  await listener?.stop();
}
