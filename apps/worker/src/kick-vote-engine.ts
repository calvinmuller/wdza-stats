import { eq } from "drizzle-orm";
import { KICK_VOTE_STARTED_CHANNEL, kickVotes, listenTo, type Database } from "@wdza-stats/db";
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
