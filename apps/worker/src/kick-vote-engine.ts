import { and, count, eq, lte } from "drizzle-orm";
import {
  KICK_VOTE_STARTED_CHANNEL,
  KICK_VOTE_UPDATED_CHANNEL,
  kickVoteBallots,
  kickVotes,
  latestSnapshots,
  listenTo,
  notifyKickVoteUpdated,
  type Database,
  type KickVoteStatus,
} from "@wdza-stats/db";
import type { RconClient } from "./rcon-client";

// Player-facing base URL for the /kick/{id} page (ticket 02) - kept here as
// copy, not env config, since it's what the in-game broadcast tells players
// to type, not an address this codebase itself ever fetches.
const KICK_VOTE_URL_BASE = "stats.wardogsza.co.za/kick";

export interface KickVoteAnnouncement {
  id: number;
  targetName: string;
  reason: string;
}

/**
 * The exact broadcast text for a just-started KickVote (ticket 01, spec.md).
 * With a single KickVote active anywhere, the bare /kick path already
 * resolves to it, so the id is only appended once a second Server's vote is
 * active at the same time and the link would otherwise be ambiguous.
 */
export function buildKickVoteBroadcast(vote: KickVoteAnnouncement, activeVoteCount: number): string {
  const url = activeVoteCount > 1 ? `${KICK_VOTE_URL_BASE}/${vote.id}` : KICK_VOTE_URL_BASE;
  return `Kick vote started against ${vote.targetName} - reason: ${vote.reason} - vote now: ${url}`;
}

async function countActiveKickVotes(db: Database): Promise<number> {
  const rows = await db.select({ id: kickVotes.id }).from(kickVotes).where(eq(kickVotes.status, "active"));
  return rows.length;
}

/** Announces one KickVote by id, if it's still active by the time this runs. */
export async function announceKickVote(db: Database, client: RconClient, kickVoteId: number): Promise<void> {
  const [vote] = await db.select().from(kickVotes).where(eq(kickVotes.id, kickVoteId)).limit(1);
  // Already resolved (e.g. the target left before this notification was
  // processed) - nothing left worth announcing.
  if (!vote || vote.status !== "active") return;

  const activeVoteCount = await countActiveKickVotes(db);
  await client.broadcast(buildKickVoteBroadcast(vote, activeVoteCount));
}

/**
 * Subscribes to newly-started KickVotes (apps/web's notifyKickVoteStarted)
 * and announces each one via RCON - the one place in this codebase allowed
 * to call RCON's write endpoints (docs/adr/0006). `ready` resolves once the
 * LISTEN is active; a notification sent before then would be missed, same
 * caveat as kill-notifications.ts's listener.
 */
export function startKickVoteAnnouncer(
  db: Database,
  client: RconClient,
  connectionString: string,
): { ready: Promise<void>; stop: () => Promise<void> } {
  const { ready, stop } = listenTo(connectionString, KICK_VOTE_STARTED_CHANNEL, (payload) => {
    const kickVoteId = Number(payload);
    if (!Number.isInteger(kickVoteId)) return;
    void announceKickVote(db, client, kickVoteId).catch((error) => {
      console.error(`[worker] kick vote announce failed for vote ${kickVoteId}:`, error);
    });
  });
  return { ready, stop };
}

// Ticket 03: resolving a KickVote.

/**
 * Atomically moves an active KickVote to a terminal status. Returns false if
 * something else (a concurrent Ballot/sweep, or a Staff cancel) resolved it
 * first - the `status = 'active'` guard is what stops two paths from both
 * resolving, and so both acting on, the same KickVote.
 */
async function claimResolution(
  db: Database,
  kickVoteId: number,
  status: Exclude<KickVoteStatus, "active">,
): Promise<boolean> {
  const rows = await db
    .update(kickVotes)
    .set({ status, resolvedAt: new Date() })
    .where(and(eq(kickVotes.id, kickVoteId), eq(kickVotes.status, "active")))
    .returning({ id: kickVotes.id });
  if (rows.length === 0) return false;
  // Pushes the terminal status to every /kick/{id} page open on this vote
  // (apps/web's kick-vote-notifications.ts) - the only place a resolution is
  // shown, since there is no in-game broadcast after the start (spec.md).
  await notifyKickVoteUpdated(db, kickVoteId);
  return true;
}

/**
 * Kicks the target of a KickVote this call just claimed as succeeded. If the
 * RCON call fails, the claim is undone - "succeeded" means the kick was made
 * (see KickVoteStatus) - so the next sweep retries it rather than the page
 * reporting a kick that never happened. Rethrows for the caller to log.
 */
async function kickClaimedTarget(db: Database, client: RconClient, kickVoteId: number, steamId: string) {
  try {
    await client.kickPlayer(steamId);
  } catch (error) {
    await db
      .update(kickVotes)
      .set({ status: "active", resolvedAt: null })
      .where(and(eq(kickVotes.id, kickVoteId), eq(kickVotes.status, "succeeded")));
    await notifyKickVoteUpdated(db, kickVoteId);
    throw error;
  }
}

/**
 * Whether steamId is in the Server's latest Snapshot. With no Snapshot yet
 * there's no evidence the target left, so they count as still online.
 */
async function isTargetOnline(db: Database, serverId: number, steamId: string): Promise<boolean> {
  const [row] = await db
    .select({ payload: latestSnapshots.payload })
    .from(latestSnapshots)
    .where(eq(latestSnapshots.serverId, serverId));
  if (!row) return true;
  return row.payload.players.some((player) => player.steamId === steamId);
}

/**
 * Decides and applies one KickVote's outcome, if it has one yet. Only ever
 * touches KickVotes on `serverId` - the Server this Worker's RconClient
 * talks to - so a kick can never be sent to the wrong Server.
 */
export async function resolveKickVote(
  db: Database,
  client: RconClient,
  serverId: number,
  kickVoteId: number,
): Promise<void> {
  const [vote] = await db
    .select()
    .from(kickVotes)
    .where(and(eq(kickVotes.id, kickVoteId), eq(kickVotes.serverId, serverId)))
    .limit(1);
  // Deliberately no early return on vote.status here: claimResolution's
  // atomic `status = 'active'` transition is the one gate, so a Ballot and
  // the sweep racing on the same KickVote can't both act on it.
  if (!vote) return;

  // Checked first: with the target gone there is nothing left to kick,
  // whatever the Ballot count says.
  if (!(await isTargetOnline(db, serverId, vote.targetSteamId))) {
    await claimResolution(db, kickVoteId, "targetLeft");
    return;
  }

  // Only Ballots cast inside the window count, so a Ballot that crosses the
  // threshold after endsAt can never turn an expired vote into a kick,
  // however late this runs.
  const [inWindowBallots] = await db
    .select({ count: count() })
    .from(kickVoteBallots)
    .where(and(eq(kickVoteBallots.kickVoteId, kickVoteId), lte(kickVoteBallots.castAt, vote.endsAt)));

  if ((inWindowBallots?.count ?? 0) >= vote.threshold) {
    if (await claimResolution(db, kickVoteId, "succeeded")) {
      await kickClaimedTarget(db, client, kickVoteId, vote.targetSteamId);
    }
    return;
  }

  if (vote.endsAt.getTime() <= Date.now()) {
    await claimResolution(db, kickVoteId, "expired");
  }
}

/**
 * Resolves every active KickVote on `serverId` that has an outcome by now -
 * the catch-all for the two things no Ballot ever signals: the window
 * closing (expired) and the target leaving (targetLeft). Also picks up a
 * threshold crossing whose kick_vote_updated notification this Worker
 * missed (e.g. while restarting).
 */
export async function sweepKickVotes(db: Database, client: RconClient, serverId: number): Promise<void> {
  const active = await db
    .select({ id: kickVotes.id })
    .from(kickVotes)
    .where(and(eq(kickVotes.serverId, serverId), eq(kickVotes.status, "active")));
  for (const vote of active) {
    await resolveKickVote(db, client, serverId, vote.id);
  }
}

/**
 * Resolves this Server's KickVotes as soon as they have an outcome: on every
 * kick_vote_updated notification (each Ballot apps/web casts - the moment a
 * threshold can be crossed) and on a sweep every `intervalMs` (for expiry
 * and the target leaving, which no Ballot signals). `ready` resolves once
 * the LISTEN is active.
 */
export function startKickVoteResolver(
  db: Database,
  client: RconClient,
  serverId: number,
  connectionString: string,
  intervalMs: number,
): { ready: Promise<void>; stop: () => Promise<void> } {
  const resolveOne = (kickVoteId: number) =>
    resolveKickVote(db, client, serverId, kickVoteId).catch((error) => {
      console.error(`[worker] kick vote resolution failed for vote ${kickVoteId}:`, error);
    });
  const sweep = () =>
    sweepKickVotes(db, client, serverId).catch((error) => {
      console.error(`[worker] kick vote sweep failed for server ${serverId}:`, error);
    });

  const { ready, stop } = listenTo(
    connectionString,
    KICK_VOTE_UPDATED_CHANNEL,
    (payload) => {
      const kickVoteId = Number(payload);
      if (Number.isInteger(kickVoteId)) void resolveOne(kickVoteId);
    },
    // After a reconnect Ballot notifications may have been missed.
    () => void sweep(),
  );
  const interval = setInterval(() => void sweep(), intervalMs);

  return {
    ready,
    stop: async () => {
      clearInterval(interval);
      await stop();
    },
  };
}
