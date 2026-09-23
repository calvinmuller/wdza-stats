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
A player's totals aggregated across every closed Match on one Server, keyed by steamId + Server — including both Wardogs-reported totals (kills, deaths, matchesPlayed) and gamification totals we invent ourselves (xp, level, currentKillStreak, highestKillStreak, mvpCount). One row per player per Server is the single source of truth for both; there is no separate progression table. Scoped per-Server by design: the same steamId can have separate career totals and separate XP/level on different Servers, since rules and communities differ between them.
_Avoid_: Lifetime stats, player profile, PlayerProfile, progression record

**SteamProfile**:
A player's persona name, avatar, and unlocked WARDOGS achievements as reported by the Steam Web API, keyed by steamId alone. Unlike PlayerCareerStat, this is a property of the Steam account itself, not of any one Server, so it is never scoped or duplicated per-Server. Refreshed when the player appears in a newly-closed Match; cached as unavailable rather than retried when Steam reports the underlying data as private.
_Avoid_: Player profile, Steam stats

**GameEvent**:
A domain-level occurrence (a kill, a death, a join, a leave, a kill-streak change, a Faction taking the lead, a Match starting or ending) inferred by diffing two consecutive Snapshots for one player or Match. Not a raw feed from the RCON API, since no such stream exists — a GameEvent is always an inference, never a direct report. The game's kill feed is a separate, direct source: see **Kill**, which is never a GameEvent. Persisted as the sole, idempotent input that the XP, Challenge, and Achievement engines react to; never bypassed by those engines calling RCON or Snapshot data directly.
_Avoid_: Event (too ambiguous outside this glossary), RCON event

**Kill**:
One killing (or environmental death) reported directly by the game's kill feed: who killed whom, with what cause, at what distance, and any tags such as headshot. Unlike a GameEvent it is a report, not an inference, and it carries the game's own event identity so the same Kill can never be stored twice. A Kill with no killer is a death by the environment (e.g. a fall). Attributed to the Server that sent it, and to the Match open on that Server when it arrived (the feed's own match id is not a Match).
_Avoid_: KillEvent, KillFeedEvent (the kill feed is the stream; a Kill is one record in it), GameEvent (reserved for inferences)

**KillStreak**:
A player's count of consecutive kills without an intervening death. Scoped to a single Match: it always resets to 0 when a new Match starts, regardless of how many consecutive kills the player had when the previous Match ended.
_Avoid_: Streak (ambiguous with other running counters)

**XpTransaction**:
An immutable ledger entry recording one award of XP to a player for one GameEvent or milestone. Keyed so the same GameEvent can never award XP twice. `PlayerCareerStat.xp` is a cached running total derived by summing these, kept only for fast leaderboard reads — the ledger, not the cached total, is the source of truth.
_Avoid_: XP award, XP log

**Achievement**:
A one-time milestone a player unlocks at most once per Server (first kill, a kill-streak threshold, 100 matches played, etc.), recorded in PlayerAchievement with an unlock timestamp.
_Avoid_: Badge, trophy

**Challenge**:
A goal with a target and a deadline (daily is the first scope shipped; weekly/season/server-wide are designed for but not yet built) that a player makes progress toward and completes once for an XP reward. Tracked separately per player per active Challenge instance, so multiple concurrent Challenges don't interfere with each other's progress.
_Avoid_: Quest, mission, task

**Notification**:
A throttled, recorded representation of a noteworthy GameEvent or milestone, shown in the dashboard's recent-events feed. Still never delivered to the game server itself — see [docs/adr/0003](./docs/adr/0003-gamification-notifications-stay-off-rcon-writes.md) for why RCON stays read-only for this concept specifically. **KickVote** below is a narrow, unrelated exception to that read-only boundary — see [docs/adr/0006](./docs/adr/0006-kick-votes-get-a-narrow-rcon-write-exception.md).
_Avoid_: Broadcast (a Notification is still never delivered to players; a KickVote's own announcement is a different concept — see **KickVote**), alert

**KickVote**:
A Server-scoped campaign to force a disruptive player (typically a suspected cheater) off that Server, started by any site visitor against a steamId currently present in that Server's live Snapshot. Decided by a threshold count of KickVoteBallots within a fixed time window (both values configured, not hardcoded); reaching the threshold first triggers a real RCON kick of the target. Announced once, at start, via a real RCON broadcast — the one instance in this codebase of RCON being written to rather than only read, per [docs/adr/0006](./docs/adr/0006-kick-votes-get-a-narrow-rcon-write-exception.md). Exactly one may be active per Server at a time. Ends as exactly one of: succeeded (threshold reached), expired (window elapsed first), targetLeft (the target dropped out of the Server's Snapshot before either), or staffCancelled (a moderator or admin ended it early).
_Avoid_: Vote (ambiguous with **KickVoteBallot**, the individual cast vote), poll (already means something else — see **Snapshot**)

**KickVoteBallot**:
One browser session's vote toward one KickVote. Sessions, not players, are what's counted here: this codebase has no player identity beyond a steamId reported by the game, so a KickVoteBallot is deliberately scoped to "one browser session voted," not "one player voted" — see the initiator/voter identity trade-off in [docs/adr/0006](./docs/adr/0006-kick-votes-get-a-narrow-rcon-write-exception.md). At most one KickVoteBallot per session per KickVote; there is no way to retract one once cast.
_Avoid_: Vote (see **KickVote**)

**Staff Member**:
A person who signs in to run the site: moderating players and, for admins, tuning the game's configuration. Identified by an email address and password, and holds exactly one Role. Distinct from a player: players are only ever a steamId in the stats and never sign in. There is no general "account" or "user" concept.
_Avoid_: User, Account, Admin (that is a Role, not a kind of person)

**Role**:
What a Staff Member is allowed to do. `moderator` can ban and unban players. `admin` can do everything a moderator can, plus edit game configuration, generate feed tokens, and manage Staff Members and their Roles. The last remaining admin can never be removed or demoted.
_Avoid_: Permission level, group
