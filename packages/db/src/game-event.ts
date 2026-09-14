// GameEvent: a domain-level occurrence inferred by diffing two consecutive
// Snapshots for one player or Match. See CONTEXT.md.

// Ticket 01 emits PlayerJoined/PlayerLeft; ticket 02 adds Match start/end and
// kill/death; ticket 03 adds Faction score/lead changes. Later tickets
// extend this union further (streak changes) as each is built.
export type GameEventType =
  | "PlayerJoined"
  | "PlayerLeft"
  | "MatchStarted"
  | "MatchEnded"
  | "PlayerKilled"
  | "PlayerDeath"
  | "FactionScoreChanged"
  | "FactionTookLead";
