import type { ChallengeScope, ChallengeType } from "@wdza-stats/db";
import type { MatchCompletionInfo, RecordedGameEvent } from "./xp-engine";

/** The Challenge Engine's own view of a challenge_definitions row - see schema.ts. */
export interface ChallengeDefinitionRow {
  id: number;
  type: ChallengeType;
  scope: ChallengeScope;
  target: number;
  xpReward: number;
}

/**
 * Today's period key for the "daily" scope: the UTC calendar date `date`
 * falls on, as YYYY-MM-DD. Deterministic and stable across however many
 * times it's computed for the same instant, which is what lets
 * dailyChallengeInstanceDrafts' (definitionId, serverId, periodKey) triple
 * make generation idempotent (see schema.ts's challengeInstances doc
 * comment) - re-running generation for the same UTC day always produces the
 * same key, so it never creates a second instance for a day that already has
 * one.
 */
export function dailyPeriodKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface ChallengeInstanceDraft {
  definitionId: number;
  serverId: number;
  periodKey: string;
}

/**
 * One ChallengeInstance draft per "daily"-scoped ChallengeDefinition, for
 * `serverId`'s `periodKey`. Weekly/season/server-scoped definitions (not
 * built yet - see challenge.ts's ChallengeScope) are silently skipped rather
 * than erroring, so this function stays total as those scopes are added
 * later. The caller (match-tracker.ts's ensureDailyChallengeInstances)
 * persists the result via an insert guarded by challengeInstances' own
 * (definition_id, server_id, period_key) uniqueness, which is what actually
 * makes generation idempotent under a duplicate call - this function itself
 * has no memory of what's already been persisted.
 */
export function dailyChallengeInstanceDrafts(
  definitions: Pick<ChallengeDefinitionRow, "id" | "scope">[],
  serverId: number,
  periodKey: string,
): ChallengeInstanceDraft[] {
  return definitions
    .filter((definition) => definition.scope === "daily")
    .map((definition) => ({ definitionId: definition.id, serverId, periodKey }));
}

/** One active ChallengeInstance the Challenge Engine can currently award progress toward. */
export interface ActiveChallengeInstance {
  instanceId: number;
  target: number;
  xpReward: number;
}

/** Everything computeChallengeProgressUpdates needs beyond the events themselves, gathered by the caller so the diff stays pure. */
export interface ChallengeProgressContext {
  // This period's active instances, grouped by the ChallengeType they measure
  // - a Server can run more than one concurrent instance of the same type
  // (e.g. two differently-tuned "kills" challenges), so each type maps to a
  // list, not a single instance.
  instancesByType: Map<ChallengeType, ActiveChallengeInstance[]>;
  // Each instance's current progress per player, as last persisted to
  // player_challenge_progress - keyed by `${instanceId}:${steamId}` (see
  // progressKey). Absent from the map means 0, matching a player with no row
  // yet.
  currentProgress: Map<string, number>;
  // matchId -> that Match's completion info, present only for a MatchEnded
  // event whose Match this batch actually closed - reused as-is from
  // xp-engine.ts's XpTransactionContext.matchCompletions, since both engines
  // need the identical participant roster/winning-Faction shape off the same
  // MatchEnded event.
  matchCompletions: Map<number, MatchCompletionInfo>;
  // `${matchId}:${steamId}` -> that player's total PlayerKilled count within
  // that Match as of this batch (including this batch's own kills) - the
  // watermark value "kills_in_match" instances measure against. Built by the
  // caller from a fresh count query (see match-tracker.ts's
  // buildChallengeProgressContext), since a single Match's kills accumulate
  // across many polls, not just the current batch.
  killCountInMatch: Map<string, number>;
  // steamId -> that player's PlayerKilled count since their most recent
  // PlayerDeath on this Server, as of this batch (including this batch's own
  // kills) - the watermark value "kills_without_dying" instances measure
  // against. Unlike killCountInMatch, this is Match-independent (see
  // challenge.ts's ChallengeType doc comment for why "kills_without_dying"
  // deliberately isn't the same signal as "kill_streak"): a run that's still
  // active when a Match ends keeps counting into the next one, resetting only
  // on that player's own PlayerDeath, wherever it falls.
  killsSinceDeath: Map<string, number>;
}

export interface ChallengeProgressUpdate {
  instanceId: number;
  steamId: string;
  // The instance's new absolute progress value (not a delta) - for an
  // "increment" type this is priorProgress + however many qualifying events
  // this batch added; for a "watermark" type it's
  // max(priorProgress, this batch's peak value). Always monotonically
  // non-decreasing versus what's currently persisted.
  progress: number;
  target: number;
  xpReward: number;
  // The GameEvent that produced this update, carried through so the caller
  // can attribute the resulting XpTransaction (if this update completes the
  // instance) to a real event, matching every other XP-awarding reason.
  eventId: number;
}

function progressKey(instanceId: number, steamId: string): string {
  return `${instanceId}:${steamId}`;
}

/**
 * Folds one instance's progress forward within a single computeChallengeProgressUpdates
 * call: reads whatever this same call has already produced for
 * (instance, steamId) if any (so several qualifying events in one batch
 * chain correctly), falling back to the persisted baseline in
 * `context.currentProgress` otherwise, then applies `nextValue` to get the
 * new absolute progress to stage in `updates`.
 */
function stageUpdate(
  updates: Map<string, ChallengeProgressUpdate>,
  context: ChallengeProgressContext,
  instance: ActiveChallengeInstance,
  steamId: string,
  eventId: number,
  nextValue: (current: number) => number,
): void {
  const key = progressKey(instance.instanceId, steamId);
  const staged = updates.get(key);
  const current = staged ? staged.progress : (context.currentProgress.get(key) ?? 0);
  updates.set(key, {
    instanceId: instance.instanceId,
    steamId,
    progress: nextValue(current),
    target: instance.target,
    xpReward: instance.xpReward,
    eventId,
  });
}

/**
 * The Challenge Engine's progress diff: computes every ChallengeProgressUpdate
 * a batch of freshly-recorded GameEvents should produce, given this period's
 * active instances and their current progress (`context`). Pure - the caller
 * (match-tracker.ts) is responsible for persisting the result to
 * player_challenge_progress and checking each update against its `target`
 * for completion; this function itself has no memory of what's already been
 * persisted and never marks anything complete on its own.
 *
 * Reacts to:
 *  - PlayerKilled: increments every active "kills" instance by 1; raises
 *    every active "kills_in_match" instance's watermark to this Match's
 *    now-current kill count for the player (context.killCountInMatch); and
 *    raises every active "kills_without_dying" instance's watermark to the
 *    player's now-current kill count since their last death, Match-
 *    independent (context.killsSinceDeath) - see challenge.ts's ChallengeType
 *    doc comment for why this is deliberately not the same signal as
 *    "kill_streak" below.
 *  - PlayerKillStreakStarted/Increased: raises every active "kill_streak"
 *    instance's watermark to the event's own metadata.streak - a *Match*-
 *    scoped live streak (see CONTEXT.md's KillStreak entry), unlike
 *    "kills_without_dying" above.
 *  - MatchEnded: increments every active "matches_played" instance by 1 for
 *    each of that Match's participants (context.matchCompletions), and every
 *    active "wins" instance by 1 for participants on the winning Faction -
 *    mirroring xp-engine.ts's matchCompletionDrafts.
 */
export function computeChallengeProgressUpdates(
  events: RecordedGameEvent[],
  context: ChallengeProgressContext,
): ChallengeProgressUpdate[] {
  const updates = new Map<string, ChallengeProgressUpdate>();

  for (const event of events) {
    switch (event.type) {
      case "PlayerKilled": {
        if (!event.steamId) {
          break;
        }
        for (const instance of context.instancesByType.get("kills") ?? []) {
          stageUpdate(updates, context, instance, event.steamId, event.id, (current) => current + 1);
        }
        const killsInMatch = context.killCountInMatch.get(`${event.matchId}:${event.steamId}`) ?? 0;
        for (const instance of context.instancesByType.get("kills_in_match") ?? []) {
          stageUpdate(updates, context, instance, event.steamId, event.id, (current) =>
            Math.max(current, killsInMatch),
          );
        }
        const killsSinceDeath = context.killsSinceDeath.get(event.steamId) ?? 0;
        for (const instance of context.instancesByType.get("kills_without_dying") ?? []) {
          stageUpdate(updates, context, instance, event.steamId, event.id, (current) =>
            Math.max(current, killsSinceDeath),
          );
        }
        break;
      }
      case "PlayerKillStreakStarted":
      case "PlayerKillStreakIncreased": {
        const streak = event.metadata?.streak;
        if (!event.steamId || typeof streak !== "number") {
          break;
        }
        for (const instance of context.instancesByType.get("kill_streak") ?? []) {
          stageUpdate(updates, context, instance, event.steamId, event.id, (current) => Math.max(current, streak));
        }
        break;
      }
      case "MatchEnded": {
        const completion = context.matchCompletions.get(event.matchId);
        if (!completion) {
          break;
        }
        for (const participant of completion.participants) {
          for (const instance of context.instancesByType.get("matches_played") ?? []) {
            stageUpdate(updates, context, instance, participant.steamId, event.id, (current) => current + 1);
          }
          if (completion.winningFaction && participant.faction === completion.winningFaction) {
            for (const instance of context.instancesByType.get("wins") ?? []) {
              stageUpdate(updates, context, instance, participant.steamId, event.id, (current) => current + 1);
            }
          }
        }
        break;
      }
      default:
        break;
    }
  }

  return [...updates.values()];
}
