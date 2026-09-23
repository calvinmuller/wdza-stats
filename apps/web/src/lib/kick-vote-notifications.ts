import { KICK_VOTE_UPDATED_CHANNEL, listenTo, requireEnv } from "@wdza-stats/db";

// How a cast Ballot (or a resolution, ticket 03) reaches every /kick/{id}
// page open on it, whichever web process the request landed on - the same
// LISTEN/NOTIFY shape as kill-notifications.ts, keyed by KickVote id instead
// of Server id.

type Wake = () => void;

interface Listener {
  ready: Promise<void>;
  stop: () => Promise<void>;
  subscribers: Map<number, Set<Wake>>;
}

// On globalThis so dev-server module reloads don't leave a stray connection each time.
const holder = globalThis as unknown as { __kickVoteUpdateListener?: Listener };

function startListener(): Listener {
  const subscribers = new Map<number, Set<Wake>>();
  const wakeAll = (kickVoteId?: number) => {
    for (const [id, wakes] of subscribers) {
      if (kickVoteId === undefined || kickVoteId === id) wakes.forEach((wake) => wake());
    }
  };
  const { ready, stop } = listenTo(
    requireEnv("DATABASE_URL"),
    KICK_VOTE_UPDATED_CHANNEL,
    (payload) => wakeAll(Number(payload)),
    // After a reconnect notifications may have been missed: everyone re-reads.
    () => wakeAll(),
  );
  return { ready, stop, subscribers };
}

/**
 * Runs `wake` whenever this KickVote changes. Resolves once the LISTEN is
 * active, with the function that unsubscribes.
 */
export async function subscribeToKickVoteUpdates(kickVoteId: number, wake: Wake): Promise<() => void> {
  const listener = (holder.__kickVoteUpdateListener ??= startListener());
  const wakes = listener.subscribers.get(kickVoteId) ?? new Set<Wake>();
  listener.subscribers.set(kickVoteId, wakes);
  wakes.add(wake);
  await listener.ready;
  return () => {
    wakes.delete(wake);
    if (wakes.size === 0) listener.subscribers.delete(kickVoteId);
  };
}

/** Closes this process's LISTEN connection (shutdown, and tests). */
export async function stopKickVoteUpdateListener(): Promise<void> {
  const listener = holder.__kickVoteUpdateListener;
  holder.__kickVoteUpdateListener = undefined;
  await listener?.stop();
}
