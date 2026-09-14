Status: ready-for-agent

# Wardogs Gamification Engine

## Problem Statement

WDZA Stats currently mirrors Wardogs' own live state and per-Server career totals (kills, deaths, cash), but gives players no reason to keep coming back beyond checking a number. There's no progression, no goals, no recognition beyond raw stats. We want to layer gamification (XP, levels, kill streaks, achievements, daily challenges, MVPs, leaderboards) on top of the existing snapshot/Match/PlayerCareerStat pipeline, without touching how that pipeline ingests or stores Wardogs' own reported state.

## Solution

A GameEvent layer sits between the existing snapshot ingestion (unchanged) and everything gamification-related. Every domain event (kills, deaths, joins, leaves, streak changes, faction lead changes, match start/end) is *inferred* by diffing consecutive Snapshots — never a raw feed, since the RCON API has no memory of anything before the current Snapshot. GameEvents are persisted, idempotent, and are the *only* input the Progression, Challenge, Achievement, and Notification engines consume — none of them ever touch RCON or Snapshot data directly. Progression state (XP, level, lifetime stats, streaks) is scoped per-Server, folded into the existing `playerCareerStats` table rather than a new parallel concept.

## Domain Decisions (from grilling session)

- **Scope**: build all layers (events → progression → streaks/match/MVP/achievements → challenges → notifications → leaderboards/dashboard) in one continuous pass; no gated checkpoints between them. Still decomposed into independently-verifiable tickets below.
- **Progression is per-Server**, matching `PlayerCareerStat`'s existing precedent — the same steamId has separate XP/level/stats on different Servers, since rules and communities differ.
- **XP/level/streaks/MVP count live as new columns on the existing `playerCareerStats` table** (`xp`, `level`, `matchesWon`, `matchesLost`, `highestKillStreak`, `currentKillStreak`, `mvpCount`) — not a separate `PlayerProfile` table. See updated `PlayerCareerStat` entry in `CONTEXT.md`.
- **Kill streaks are Match-scoped**: always reset to 0 at `MatchStarted`, regardless of how a streak ended in the previous Match.
- **No kill/death attribution**: `PlayerKilled` and `PlayerDeath` are independent per-player GameEvents; `targetSteamId` is never populated in v1, since a 15s poll window can contain multiple simultaneous kills/deaths with no safe way to pair them.
- **No PlayerJoined/PlayerLeft debounce**: every roster diff is taken literally (missing for one poll = a real Leave), consistent with the existing "one Snapshot is all we know" principle.
- **`FactionTookLead` uses strict overtake**: a tie never changes who's leading.
- **RCON stays read-only** (see `docs/adr/0003-gamification-notifications-stay-off-rcon-writes.md`): no `POST /v1/broadcast` or any other write call. This continues the original v1 spec's explicit deferral of all admin/moderation/broadcast capability to "a future phase behind real authentication" — that phase hasn't arrived. Notifications are recorded for the dashboard's recent-events feed only; a Discord webhook is the natural next delivery channel once wanted.
- **No new authentication system**: the admin config area sits behind an unguessable, env-configured secret URL path rather than real auth, since none exists in this codebase and building one is out of scope here.
- **XP rewards, level curve, and MVP formula** are seeded exactly as the spec's stated defaults (Kill +100, Match completed +250, Match win +500, First blood +100, streak3/5/10 +150/+250/+500; level curve 0/1,000/2,500/4,500/…; MVP = kills×10 − deaths×5), all stored as config rows editable later, not hardcoded.
- **Observability**: extend the existing plain `console.log`/`[worker]`-prefix convention with the relevant identifiers (serverId, matchId, steamId, eventId) inline — no new logging library.
- **No new cache layer**: leaderboards read straight from Postgres with appropriate indexes; no Redis unless it proves necessary later.

## New Domain Vocabulary

Recorded in `CONTEXT.md`: `GameEvent`, `KillStreak`, `XpTransaction`, `Achievement`, `Challenge`, `Notification`. `PlayerCareerStat`'s definition was updated to note it now also carries gamification totals.

## Out of Scope

- Any RCON write call (broadcast, message, kick, etc.) — see ADR 0003.
- A real authentication system for the admin area — hidden-URL only.
- Weekly/season/server-wide challenge scopes — daily only for now, though the model is designed to extend to them later.
- Bounty system, rivalries, faction wars, Discord integration, double-XP events, boss/wanted-player system — all future extensions this design should make easy (subscribe to existing GameEvents) but none are built here.
- Multi-server UI — the schema and progression model are per-Server-ready, but only the one configured Server exists today.

## Further Notes

- This spec depends on `docs/adr/0001-infer-match-boundaries-from-snapshot-deltas.md` (Match boundary inference) and `docs/adr/0003-gamification-notifications-stay-off-rcon-writes.md` (no RCON writes).
- Domain vocabulary throughout this spec and its implementation must match `CONTEXT.md` exactly.
- Ticket breakdown lives in `issues/`, numbered in dependency order (blockers first). Ticket 01 is the only one with no blockers and can start immediately.
