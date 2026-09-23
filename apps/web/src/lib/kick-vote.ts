import { and, eq, gt, sql } from "drizzle-orm";
import {
  KICK_VOTE_STARTED_CHANNEL,
  kickVoteSettings,
  kickVotes,
  latestSnapshots,
  type Database,
  type KickVoteStatus,
} from "@wdza-stats/db";

// KickVote's data access layer (ticket 01) - see CONTEXT.md's KickVote entry,
// spec.md, and docs/adr/0006. Kept separate from app/kick-vote-actions.ts's
// Server Action so it can be exercised directly against a real database, the
// same split admin-config.ts uses for the admin area.

export type KickVoteResult = { ok: true; kickVoteId: number } | { ok: false; error: string };

export interface ActiveKickVoteView {
  id: number;
  targetName: string;
  reason: string;
  status: KickVoteStatus;
  endsAt: Date;
}

async function getSettings(db: Database) {
  const [row] = await db.select().from(kickVoteSettings).where(eq(kickVoteSettings.id, 1));
  if (!row) {
    throw new Error("KickVote settings row is missing");
  }
  return row;
}

/** The Server's active KickVote, or null if it doesn't have one right now. */
export async function getActiveKickVote(db: Database, serverId: number): Promise<ActiveKickVoteView | null> {
  const [row] = await db
    .select({
      id: kickVotes.id,
      targetName: kickVotes.targetName,
      reason: kickVotes.reason,
      status: kickVotes.status,
      endsAt: kickVotes.endsAt,
    })
    .from(kickVotes)
    .where(and(eq(kickVotes.serverId, serverId), eq(kickVotes.status, "active")))
    .limit(1);
  return row ?? null;
}

/** Tells the Worker's kick-vote-engine to announce a just-started KickVote via RCON. */
export async function notifyKickVoteStarted(db: Database, kickVoteId: number): Promise<void> {
  await db.execute(sql`select pg_notify(${KICK_VOTE_STARTED_CHANNEL}, ${String(kickVoteId)})`);
}

export interface OnlinePlayer {
  steamId: string;
  displayName: string;
}

/**
 * Every steamId currently online on the Server, per its latest Snapshot -
 * the target picker's source list, and the check a start request is
 * validated against (never trust the steamId/name a form submitted). Empty
 * when the Server hasn't been polled yet.
 */
export async function getOnlinePlayers(db: Database, serverId: number): Promise<OnlinePlayer[]> {
  const [row] = await db
    .select({ payload: latestSnapshots.payload })
    .from(latestSnapshots)
    .where(eq(latestSnapshots.serverId, serverId));
  if (!row) return [];
  return row.payload.players.map((player) => ({ steamId: player.steamId, displayName: player.displayName }));
}

/**
 * Starts a KickVote against a currently-online target, snapshotting
 * threshold/duration from kickVoteSettings, then notifies the Worker to make
 * the in-game broadcast. Rejects (without notifying) if the reason is empty,
 * the target isn't online, the initiating session is still in its cooldown,
 * or the Server already has an active KickVote - the
 * kick_votes_one_active_per_server_idx unique index is only the backstop for
 * a race between two rejections passing at once.
 */
export async function startKickVote(
  db: Database,
  input: { serverId: number; targetSteamId: string; reason: string; initiatorSessionId: string },
): Promise<KickVoteResult> {
  const reason = input.reason.trim();
  if (!reason) {
    return { ok: false, error: "Enter a reason for the KickVote." };
  }

  const onlinePlayers = await getOnlinePlayers(db, input.serverId);
  const target = onlinePlayers.find((player) => player.steamId === input.targetSteamId);
  if (!target) {
    return { ok: false, error: "That player is not currently online on this Server." };
  }

  const settings = await getSettings(db);

  const cooldownCutoff = new Date(Date.now() - settings.initiatorCooldownSeconds * 1000);
  const [recentStart] = await db
    .select({ id: kickVotes.id })
    .from(kickVotes)
    .where(and(eq(kickVotes.initiatorSessionId, input.initiatorSessionId), gt(kickVotes.startedAt, cooldownCutoff)))
    .limit(1);
  if (recentStart) {
    return { ok: false, error: "You started a KickVote recently - wait before starting another." };
  }

  const active = await getActiveKickVote(db, input.serverId);
  if (active) {
    return { ok: false, error: "A KickVote is already active on this Server." };
  }

  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + settings.durationSeconds * 1000);

  const [row] = await db
    .insert(kickVotes)
    .values({
      serverId: input.serverId,
      targetSteamId: target.steamId,
      targetName: target.displayName,
      reason,
      initiatorSessionId: input.initiatorSessionId,
      threshold: settings.thresholdBallots,
      durationSeconds: settings.durationSeconds,
      startedAt,
      endsAt,
      status: "active",
    })
    .returning({ id: kickVotes.id });

  await notifyKickVoteStarted(db, row.id);

  return { ok: true, kickVoteId: row.id };
}
