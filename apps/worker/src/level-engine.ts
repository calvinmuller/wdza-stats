import { buildIdempotencyKey, type GameEventContext, type GameEventDraft } from "./game-events";

/**
 * One `PlayerLevelUp` draft per level gained between `previousLevel` and
 * `newLevel` (both already resolved by the caller via `levelForXp` -
 * see match-tracker.ts's applyLevelUps, which keeps `previousLevel`'s
 * persisted column in sync with xp after every prior award). A single XP
 * award that crosses two thresholds at once (e.g. a kill-streak milestone
 * landing on top of an already-large total) still emits one event per level
 * crossed, not one event for the whole jump - each is its own countable
 * milestone for the Notification/Achievement engines downstream, matching
 * how counterDeltaEvents in game-events.ts emits one PlayerKilled per kill
 * rather than one per batch.
 *
 * `context.matchId` is whichever Match is open at the moment this batch is
 * processed (match-tracker.ts's `currentMatchId`) - level is a Server-scoped
 * total, not a Match-scoped one, so which Match a PlayerLevelUp is attributed
 * to is little more than "where was this player when it happened"; the
 * required `matchId` column just needs *a* value.
 */
export function levelUpEvents(
  steamId: string,
  previousLevel: number,
  newLevel: number,
  context: GameEventContext,
): GameEventDraft[] {
  const events: GameEventDraft[] = [];

  for (let level = previousLevel + 1; level <= newLevel; level++) {
    events.push({
      serverId: context.serverId,
      matchId: context.matchId,
      type: "PlayerLevelUp",
      timestamp: context.timestamp,
      steamId,
      targetSteamId: null,
      faction: null,
      metadata: { level },
      sourceSnapshotId: context.sourceSnapshotId,
      idempotencyKey: buildIdempotencyKey(context, "PlayerLevelUp", steamId, String(level)),
    });
  }

  return events;
}
