# WDZA Stats

A public stats site that turns a live-only Wardogs RCON feed into historical match and player data for one or more game servers.

## Language

**Server**:
A single Wardogs game server instance we track, identified by its RCON endpoint. Every other concept below is scoped to one Server, even before a second Server exists.
_Avoid_: Instance, node

**Snapshot**:
The merged status+players payload captured from one poll of a Server's RCON API, timestamped at capture time. Matches and player stats are derived entirely from a sequence of Snapshots — the RCON API itself has no memory of anything before the current Snapshot.
_Avoid_: Poll (poll is the verb for fetching one; Snapshot is the noun for what was captured), Tick (the RCON API already uses "tick" for the unrelated `scoreTick` config value)

**Match**:
One bounded round of play on a single map/experience/rotation entry, from the point we detect it started until we detect it ended. Named after the RCON API's own `/v1/match/*` endpoints. The API sends no explicit start/end event for a Match: a new one is inferred whenever a Server's `map` or rotation position changes, or when players' cumulative counters drop below their prior Snapshot's values (a same-map restart).
_Avoid_: Round, Session, Game

**Faction**:
One of a Server's competing sides in a Match (e.g. Lonestar, Valkyra, Manticore), with its own running score. Faction names and colors are defined per-Server, not fixed across all Wardogs servers.
A round/game is one by the first faction to reach 100
_Avoid_: Team

**PlayerMatchStat**:
One player's kills/deaths/cash earned within one Match, computed as the delta between their counter values at the first and last Snapshot in which they appeared during that Match. A player who switches Faction mid-Match is attributed to whichever Faction they were on at their last Snapshot in that Match.
_Avoid_: Round stats, player match record

**PlayerCareerStat**:
A player's totals aggregated across every closed Match on one Server, keyed by steamId + Server. Derived/rollup data — PlayerMatchStat rows are the source of truth. Scoped per-Server by design: the same steamId can have separate career totals on different Servers, since rules and communities differ between them.
_Avoid_: Lifetime stats, player profile

**SteamProfile**:
A player's persona name, avatar, and unlocked WARDOGS achievements as reported by the Steam Web API, keyed by steamId alone. Unlike PlayerCareerStat, this is a property of the Steam account itself, not of any one Server, so it is never scoped or duplicated per-Server. Refreshed when the player appears in a newly-closed Match; cached as unavailable rather than retried when Steam reports the underlying data as private.
_Avoid_: Player profile, Steam stats
