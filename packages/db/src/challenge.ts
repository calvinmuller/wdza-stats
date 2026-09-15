// Challenge: a goal with a target and a deadline that a player makes
// progress toward and completes once for an XP reward. See CONTEXT.md.

// Daily is the only scope generated today; the model (challenge_definitions'
// own `scope` column) leaves room for weekly/season/server later without a
// schema change - see spec.md's Out of Scope.
export type ChallengeScope = "daily";

// Which GameEvent(s) a ChallengeDefinition's progress is measured from, and
// how - see apps/worker/src/challenge-engine.ts's computeChallengeProgressUpdates
// (its per-GameEventType switch) for the mapping from each of these to the
// GameEvent type(s) it reacts to and whether its progress accumulates or
// watermarks:
//   - "kills": total PlayerKilled events that day (increments)
//   - "wins": MatchEnded events the player's Faction won (increments)
//   - "matches_played": MatchEnded events the player participated in (increments)
//   - "kill_streak": the player's *live, Match-scoped* kill streak (see
//     CONTEXT.md's KillStreak entry - resets at every MatchStarted, same as
//     playerCareerStats.currentKillStreak) reaching this value at any point
//     that day, per PlayerKillStreakStarted/Increased's own metadata.streak
//     (watermark, never decreases even when the live streak later breaks)
//   - "kills_in_match": the player's kill count within a single Match reaching
//     this value at any point that day (watermark over each Match's own
//     PlayerKilled count, not summed across Matches)
//   - "kills_without_dying": deliberately *not* the same signal as
//     "kill_streak" despite both starting from CONTEXT.md's KillStreak
//     definition - this one is day-scoped, not Match-scoped: it keeps
//     counting across a Match boundary and only resets on the player's own
//     PlayerDeath, so a player who ends one Match on an active streak and
//     opens the kills tally in the next Match still has that run counted
//     (watermark over kills since the player's last death that day, per
//     computeChallengeProgressUpdates' killsSinceDeath context)
export type ChallengeType =
  | "kills"
  | "wins"
  | "matches_played"
  | "kill_streak"
  | "kills_in_match"
  | "kills_without_dying";

/**
 * Today's period key for the "daily" scope: the UTC calendar date `date`
 * falls on, as YYYY-MM-DD. Deterministic and stable across however many
 * times it's computed for the same instant - this is what lets
 * challengeInstances' (definition_id, server_id, period_key) uniqueness make
 * generation idempotent (see schema.ts's challengeInstances doc comment),
 * and lets any reader (worker or web) identify "today's" instances without
 * re-deriving the rule. Shared here rather than living only in
 * apps/worker/src/challenge-engine.ts (which re-exports it for its existing
 * callers) since the web dashboard needs the identical key to look up the
 * same instances.
 */
export function dailyPeriodKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
