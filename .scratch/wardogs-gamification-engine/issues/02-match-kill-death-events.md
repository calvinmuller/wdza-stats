# 02: Match lifecycle + kill/death events

**What to build:** GameEvents for the moments that matter most for gamification: a Match starting or ending, and a player getting a kill or a death. `MatchStarted`/`MatchEnded` fire at the same points the existing match-boundary detection (`docs/adr/0001`) already opens/closes a Match — this ticket wraps that logic with event emission, it does not reimplement boundary detection. `PlayerKilled`/`PlayerDeath` are inferred from kill/death counter deltas between consecutive Snapshots for a player *within* an ongoing Match; a counter drop that the existing logic already treats as a new Match must never be misread as deaths. No killer→victim attribution is attempted — `targetSteamId` stays null, since a single 15s window can contain multiple simultaneous kills and deaths with no safe way to pair them.

**Blocked by:** 01: Event log foundation + player join/leave detection

**Status:** closed

- [x] `MatchStarted` fires exactly once when a new Match is opened; `MatchEnded` fires exactly once when the previous Match closes, carrying its matchId
- [x] `PlayerKilled` fires once per unit increase in a player's kill counter between consecutive Snapshots within the same Match; `PlayerDeath` fires the same way for the death counter
- [x] A counter drop that triggers a new-Match boundary produces `MatchEnded` + `MatchStarted` but zero spurious `PlayerKilled`/`PlayerDeath` events for the reset
- [x] `targetSteamId` is never populated on `PlayerKilled`/`PlayerDeath` in this ticket
- [x] Idempotent: retrying the same snapshot comparison never duplicates any of these events
- [x] Tests cover: normal kill/death increments, a same-map restart (counter reset), and a map/rotation change — reusing the existing fixture sequences already exercised in `match-tracker.test.ts`

## Comments

Closed: implemented on top of ticket 01. `MatchStarted`/`MatchEnded`/`PlayerKilled`/`PlayerDeath` added to `GameEventType` (`packages/db/src/game-event.ts`); `game_events.steam_id` widened to nullable via `packages/db/migrations/0007_wooden_amazoness.sql` since Match-scoped events have no player. New pure builders `matchLifecycleEvent`/`diffKillDeathGameEvents` in `apps/worker/src/game-events.ts`, wired into `ingestSnapshot` in `apps/worker/src/match-tracker.ts` — kill/death diffing is gated on `!isBoundary` so a Match-boundary counter reset never misreads as deaths, matching `docs/adr/0001`. `detectMatchBoundary` itself is untouched, per the ticket. Reviewed via `/code-review` against both spec.md/this ticket and the repo's standards/smell baseline: Spec axis found zero gaps; Standards axis flagged two minor judgement calls (idempotency-key building duplicated across event types, redundant parallel Match-close state), both fixed. Full test suite (160 tests) and typecheck pass.
