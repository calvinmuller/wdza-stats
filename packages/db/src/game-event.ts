// GameEvent: a domain-level occurrence inferred by diffing two consecutive
// Snapshots for one player or Match. See CONTEXT.md.

// Ticket 01 emits PlayerJoined/PlayerLeft only. Later tickets extend this
// union (kills, deaths, streak changes, Faction lead changes, Match
// start/end) as each is built.
export type GameEventType = "PlayerJoined" | "PlayerLeft";
