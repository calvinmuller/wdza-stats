import type { GameEventType, SnapshotPlayer } from "@wdza-stats/db";

/** Everything a poll's roster diff needs to attribute and dedupe its events, gathered before diffing so the diff function stays pure. */
export interface RosterDiffContext {
  serverId: number;
  matchId: number;
  timestamp: Date;
  sourceSnapshotId: number;
}

export interface GameEventDraft {
  serverId: number;
  matchId: number;
  type: GameEventType;
  timestamp: Date;
  steamId: string;
  targetSteamId: string | null;
  faction: string | null;
  metadata: null;
  sourceSnapshotId: number;
  idempotencyKey: string;
}

/**
 * Deterministic from the event's own identity alone (Server, Match, type,
 * steamId, timestamp) - never from an auto-incrementing id like
 * sourceSnapshotId, which would differ across a retried write of the same
 * transition. Persisting two drafts with the same key is a no-op (see
 * ingestSnapshot's onConflictDoNothing), which is what makes re-running the
 * same Snapshot comparison safe.
 */
function buildIdempotencyKey(context: RosterDiffContext, type: GameEventType, steamId: string): string {
  return `${context.serverId}:${context.matchId}:${type}:${steamId}:${context.timestamp.toISOString()}`;
}

function joinLeaveEvent(
  type: GameEventType,
  player: SnapshotPlayer,
  context: RosterDiffContext,
): GameEventDraft {
  return {
    serverId: context.serverId,
    matchId: context.matchId,
    type,
    timestamp: context.timestamp,
    steamId: player.steamId,
    targetSteamId: null,
    faction: player.faction,
    metadata: null,
    sourceSnapshotId: context.sourceSnapshotId,
    idempotencyKey: buildIdempotencyKey(context, type, player.steamId),
  };
}

/**
 * `PlayerJoined` for a steamId present in `currentPlayers` but absent from
 * `previousPlayers`, `PlayerLeft` for the reverse - no debounce, every
 * roster diff between consecutive Snapshots is taken literally (see
 * CONTEXT.md's GameEvent entry and spec.md's domain decisions). A missing
 * `previousPlayers` (the first Snapshot this process has ever ingested for
 * the Server) is treated as an empty roster, so every currently-online
 * player is reported as freshly joined - mirroring
 * snapshot-poller.ts's newlyJoinedSteamIds.
 *
 * A `PlayerJoined` records the Faction the player is on in the current
 * Snapshot; a `PlayerLeft` records the last Faction they were seen on, since
 * they no longer appear in the current one.
 */
export function diffRosterGameEvents(
  previousPlayers: SnapshotPlayer[] | undefined,
  currentPlayers: SnapshotPlayer[],
  context: RosterDiffContext,
): GameEventDraft[] {
  const previous = previousPlayers ?? [];
  const previousSteamIds = new Set(previous.map((player) => player.steamId));
  const currentSteamIds = new Set(currentPlayers.map((player) => player.steamId));

  const joined = currentPlayers
    .filter((player) => !previousSteamIds.has(player.steamId))
    .map((player) => joinLeaveEvent("PlayerJoined", player, context));

  const left = previous
    .filter((player) => !currentSteamIds.has(player.steamId))
    .map((player) => joinLeaveEvent("PlayerLeft", player, context));

  return [...joined, ...left];
}
