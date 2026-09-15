// Achievement: a one-time milestone a player unlocks at most once per Server,
// recorded in PlayerAchievement with an unlock timestamp. See CONTEXT.md.

// Which kind of observed counter/condition an Achievement definition's
// `threshold` is compared against - see apps/worker/src/achievement-engine.ts
// for how each trigger's value is computed from GameEvents:
// - "first_kill": a player's total PlayerKilled GameEvents ever, this Server.
// - "kill_streak": a PlayerKillStreakStarted/Increased event's own streak.
// - "match_kills": a player's PlayerKilled GameEvents within one Match.
// - "matches_played"/"matches_won": playerCareerStats' own running totals, as
//   of the Match this batch just closed.
// - "survivor": a closed Match's per-participant death count (threshold 0).
export type AchievementTrigger =
  | "first_kill"
  | "kill_streak"
  | "match_kills"
  | "matches_played"
  | "matches_won"
  | "survivor";
