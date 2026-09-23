import { and, asc, count, eq, gt, sql } from "drizzle-orm";
import {
  bannedPlayers,
  KICK_VOTE_STARTED_CHANNEL,
  kickVoteBallots,
  kickVotes,
  latestSnapshots,
  notifyKickVoteUpdated,
  servers,
  steamProfiles,
  type Database,
  type KickVoteStatus,
} from "@wdza-stats/db";
import { getKickVoteSettings } from "./admin-config";
import { getStaffSteamIds } from "./staff-steam-link";

// KickVote's data access layer (ticket 01) - see CONTEXT.md's KickVote entry,
// spec.md, and docs/adr/0006. Kept separate from app/kick-vote-actions.ts's
// Server Action so it can be exercised directly against a real database, the
// same split admin-config.ts uses for the admin area. Also backs the admin
// area's list of active KickVotes and staff cancelling one (ticket 04).

export type KickVoteResult = { ok: true; kickVoteId: number } | { ok: false; error: string };

export interface ActiveKickVoteView {
  id: number;
  targetName: string;
  reason: string;
  status: KickVoteStatus;
  endsAt: Date;
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
 * Starts a KickVote on behalf of a Verified Player (docs/adr/0007) or a Staff
 * Member's linked steamId (docs/adr/0008), against a
 * currently-online target, snapshotting threshold/duration from
 * kickVoteSettings, then notifies the Worker to make the in-game broadcast.
 * `initiatorSteamId` and `initiatorIsStaff` must come from the caller's
 * sign-in, never a form.
 *
 * Rejects (without notifying) if the reason is empty, the initiator is
 * banned, isn't online on this Server themselves (unless they're a Staff
 * Member), or targets their own
 * steamId, the target isn't online or is a Staff Member's linked steamId, the initiator started another KickVote
 * (on any Server) inside the cooldown, or the Server already has an active
 * KickVote - the kick_votes_one_active_per_server_idx unique index is only
 * the backstop for a race between two rejections passing at once. The
 * initiator only has to be online at the start: the vote carries on if they
 * leave.
 */
export async function startKickVote(
  db: Database,
  input: { serverId: number; targetSteamId: string; reason: string; initiatorSteamId: string; initiatorIsStaff?: boolean },
): Promise<KickVoteResult> {
  const reason = input.reason.trim();
  if (!reason) {
    return { ok: false, error: "Enter a reason for the KickVote." };
  }

  const [banned] = await db
    .select({ steamId: bannedPlayers.steamId })
    .from(bannedPlayers)
    .where(eq(bannedPlayers.steamId, input.initiatorSteamId))
    .limit(1);
  if (banned) {
    return { ok: false, error: "Banned players can't start a KickVote." };
  }

  const onlinePlayers = await getOnlinePlayers(db, input.serverId);
  if (!input.initiatorIsStaff && !onlinePlayers.some((player) => player.steamId === input.initiatorSteamId)) {
    return { ok: false, error: "You need to be playing on this Server to start a KickVote." };
  }

  if (input.targetSteamId === input.initiatorSteamId) {
    return { ok: false, error: "You can't start a KickVote against yourself." };
  }

  const target = onlinePlayers.find((player) => player.steamId === input.targetSteamId);
  if (!target) {
    return { ok: false, error: "That player is not currently online on this Server." };
  }

  if ((await getStaffSteamIds(db, [target.steamId])).size > 0) {
    return { ok: false, error: "Staff Members can't be the target of a KickVote." };
  }

  const settings = await getKickVoteSettings(db);

  const cooldownCutoff = new Date(Date.now() - settings.initiatorCooldownSeconds * 1000);
  const [recentStart] = await db
    .select({ id: kickVotes.id })
    .from(kickVotes)
    .where(and(eq(kickVotes.initiatorSteamId, input.initiatorSteamId), gt(kickVotes.startedAt, cooldownCutoff)))
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
      initiatorSteamId: input.initiatorSteamId,
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

// Ticket 02: the /kick/{id} page and casting a Ballot.

export interface KickVoteDetailView {
  id: number;
  serverId: number;
  targetSteamId: string;
  targetName: string;
  reason: string;
  status: KickVoteStatus;
  threshold: number;
  startedAt: Date;
  endsAt: Date;
  resolvedAt: Date | null;
}

/**
 * One KickVote by id, or null if it doesn't exist - the /kick/{id} page's 404
 * case. Selects only public fields: who started a KickVote is for Staff
 * Members only (docs/adr/0007), so it never rides along on this public view.
 */
export async function getKickVote(db: Database, id: number): Promise<KickVoteDetailView | null> {
  const [row] = await db
    .select({
      id: kickVotes.id,
      serverId: kickVotes.serverId,
      targetSteamId: kickVotes.targetSteamId,
      targetName: kickVotes.targetName,
      reason: kickVotes.reason,
      status: kickVotes.status,
      threshold: kickVotes.threshold,
      startedAt: kickVotes.startedAt,
      endsAt: kickVotes.endsAt,
      resolvedAt: kickVotes.resolvedAt,
    })
    .from(kickVotes)
    .where(eq(kickVotes.id, id))
    .limit(1);
  return row ?? null;
}

/** How many KickVoteBallots this KickVote has - the count shown against its threshold. */
export async function getBallotCount(db: Database, kickVoteId: number): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(kickVoteBallots)
    .where(eq(kickVoteBallots.kickVoteId, kickVoteId));
  return row?.value ?? 0;
}

/** Whether this session has already cast a Ballot on this KickVote. */
export async function hasCastBallot(db: Database, kickVoteId: number, sessionId: string): Promise<boolean> {
  const [row] = await db
    .select({ sessionId: kickVoteBallots.sessionId })
    .from(kickVoteBallots)
    .where(and(eq(kickVoteBallots.kickVoteId, kickVoteId), eq(kickVoteBallots.sessionId, sessionId)))
    .limit(1);
  return row !== undefined;
}

/**
 * Casts this session's Ballot on an active KickVote. Casting again from the
 * same session is a no-op (the (kickVoteId, sessionId) primary key makes the
 * insert idempotent) rather than an error, and there is no way to remove a
 * cast Ballot - see CONTEXT.md's KickVoteBallot entry. There is deliberately
 * no check that the caller isn't the KickVote's own target: Ballots stay
 * anonymous per-browser sessions with no link to a steamId, even now that
 * starting a KickVote needs Steam sign-in (docs/adr/0007), so which session
 * "is" the target isn't determinable and isn't enforced.
 */
export async function castBallot(
  db: Database,
  input: { kickVoteId: number; sessionId: string },
): Promise<KickVoteResult> {
  const vote = await getKickVote(db, input.kickVoteId);
  if (!vote) {
    return { ok: false, error: "KickVote not found." };
  }
  // endsAt too, not just status: the Worker's sweep only marks a KickVote
  // expired on its next pass, and a Ballot in that gap must not count.
  if (vote.status !== "active" || vote.endsAt.getTime() <= Date.now()) {
    return { ok: false, error: "This KickVote has already ended." };
  }

  const inserted = await db
    .insert(kickVoteBallots)
    .values({ kickVoteId: input.kickVoteId, sessionId: input.sessionId })
    .onConflictDoNothing()
    .returning({ kickVoteId: kickVoteBallots.kickVoteId });

  // Also the Worker's cue to check whether this Ballot reached the
  // threshold (ticket 03) - apps/web can't make the kick call itself.
  if (inserted.length > 0) {
    await notifyKickVoteUpdated(db, input.kickVoteId);
  }

  return { ok: true, kickVoteId: input.kickVoteId };
}

// Ticket 04: staff cancelling an active KickVote from the admin area.

export interface ActiveKickVoteSummary {
  id: number;
  serverName: string;
  targetSteamId: string;
  targetName: string;
  reason: string;
  ballotCount: number;
  threshold: number;
  endsAt: Date;
  /** Who started it - null for KickVotes started anonymously, before Steam sign-in. Staff-only (docs/adr/0007). */
  initiatorSteamId: string | null;
  /** Their cached Steam persona name, if any. */
  initiatorName: string | null;
}

/** Every active KickVote across all Servers, oldest first, for the admin area. */
export async function listActiveKickVotes(db: Database): Promise<ActiveKickVoteSummary[]> {
  return db
    .select({
      id: kickVotes.id,
      serverName: servers.name,
      targetSteamId: kickVotes.targetSteamId,
      targetName: kickVotes.targetName,
      reason: kickVotes.reason,
      ballotCount: count(kickVoteBallots.sessionId),
      threshold: kickVotes.threshold,
      endsAt: kickVotes.endsAt,
      initiatorSteamId: kickVotes.initiatorSteamId,
      initiatorName: steamProfiles.personaName,
    })
    .from(kickVotes)
    .innerJoin(servers, eq(servers.id, kickVotes.serverId))
    .leftJoin(kickVoteBallots, eq(kickVoteBallots.kickVoteId, kickVotes.id))
    .leftJoin(steamProfiles, eq(steamProfiles.steamId, kickVotes.initiatorSteamId))
    .where(eq(kickVotes.status, "active"))
    .groupBy(kickVotes.id, servers.name, steamProfiles.personaName)
    .orderBy(asc(kickVotes.startedAt));
}

/**
 * Ends an active KickVote as staffCancelled. The same atomic
 * `WHERE status = 'active'` claim the Worker's resolver uses, so a vote that
 * has already resolved (or resolves at the same moment) keeps its own terminal
 * status and this reports an error instead of overwriting it.
 */
export async function cancelKickVote(
  db: Database,
  input: { kickVoteId: number; staffMemberId: string },
): Promise<KickVoteResult> {
  const rows = await db
    .update(kickVotes)
    .set({ status: "staffCancelled", resolvedAt: new Date(), cancelledByStaffMemberId: input.staffMemberId })
    .where(and(eq(kickVotes.id, input.kickVoteId), eq(kickVotes.status, "active")))
    .returning({ id: kickVotes.id });
  if (rows.length === 0) {
    return { ok: false, error: "This KickVote has already ended." };
  }
  // Pushes the cancellation to every /kick/{id} page open on this vote.
  await notifyKickVoteUpdated(db, input.kickVoteId);
  return { ok: true, kickVoteId: input.kickVoteId };
}
