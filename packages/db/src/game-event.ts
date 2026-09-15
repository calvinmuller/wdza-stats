// GameEvent: a domain-level occurrence inferred by diffing two consecutive
// Snapshots for one player or Match. See CONTEXT.md.

// Ticket 01 emits PlayerJoined/PlayerLeft; ticket 02 adds Match start/end and
// kill/death; ticket 03 adds Faction score/lead changes; ticket 04 adds kill
// streak changes; ticket 06 adds PlayerLevelUp; ticket 08 adds
// AchievementUnlocked. Later tickets extend this union further as each is
// built.
export type GameEventType =
  | "PlayerJoined"
  | "PlayerLeft"
  | "MatchStarted"
  | "MatchEnded"
  | "PlayerKilled"
  | "PlayerDeath"
  | "FactionScoreChanged"
  | "FactionTookLead"
  | "PlayerKillStreakStarted"
  | "PlayerKillStreakIncreased"
  | "PlayerKillStreakBroken"
  | "PlayerLevelUp"
  | "AchievementUnlocked";
