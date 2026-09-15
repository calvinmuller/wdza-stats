# 09: Daily challenges

**What to build:** A data-driven challenge system, starting with daily-scoped challenges, designed so weekly/season/server scopes can be added later without a model change. The worker deterministically generates the day's active `ChallengeInstance` rows from `ChallengeDefinition`s (get X kills, win X matches, play X matches, reach X streak, X kills in a match, X kills without dying) — safe against duplicate generation even if triggered more than once. Player progress toward each active challenge is tracked from the relevant GameEvents; reaching the target completes the challenge exactly once and awards its configured XP via ticket 05's ledger.

**Blocked by:** 02: Match lifecycle + kill/death events, 05: XP ledger + XP awards

**Status:** closed

- [x] `ChallengeDefinition`, `ChallengeInstance`, `PlayerChallengeProgress`, and `ChallengeCompletion` models exist, with a `scope` field supporting `daily` today and room for `weekly`/`season`/`server` later
- [x] Daily challenge generation is deterministic and cannot create duplicate instances for the same day/definition, even if run more than once (e.g. a future second worker instance)
- [x] Progress updates correctly from the relevant GameEvent types for each challenge type
- [x] Reaching the target completes the challenge exactly once and awards XP exactly once, even if the qualifying event recurs afterward
- [x] Tests cover: generation not duplicating, progress incrementing correctly for at least two challenge types, and completion firing exactly once

## Comments

Closed: implemented on `master` (commit `b3884c5`). `packages/db/src/challenge.ts` defines `ChallengeScope`/`ChallengeType`; `packages/db/src/schema.ts` adds `challenge_definitions`/`challenge_instances`/`player_challenge_progress`/`challenge_completions`. `apps/worker/src/challenge-engine.ts` is a pure diff (`computeChallengeProgressUpdates`) from recorded GameEvents + active-instance context to progress updates, covering all six types: `kills`/`matches_played`/`wins` increment off PlayerKilled/MatchEnded, `kill_streak` watermarks the live Match-scoped streak off PlayerKillStreakStarted/Increased, `kills_in_match` watermarks a per-Match kill count, and `kills_without_dying` watermarks a day-scoped, Match-independent "kills since last death" count (deliberately distinct from `kill_streak` - see challenge.ts's ChallengeType doc comment).

Generation (`ensureDailyChallengeInstances` in `match-tracker.ts`) runs every poll and is idempotent via `challenge_instances`' `(definition_id, server_id, period_key)` unique constraint. Completion is idempotent via `challenge_completions`' `(instance_id, steam_id)` primary key; the resulting XP award reuses ticket 05's `xp_transactions` ledger under a new `challenge_completed` reason, made idempotent per-instance via a partial unique index (`schema.ts`'s `xp_transactions` doc comment explains why a shared index with the pre-existing reasons wouldn't work, since Postgres treats NULLs as distinct).

Seeded one `challenge_definitions` row per type in migration `0012_opposite_mac_gargan.sql` with placeholder target/XP values (not specified in spec.md) so the system does something out of the box; editable later like every other config table here.

Verified via `apps/worker/src/challenge-engine.test.ts` (pure-function coverage of all six types plus generation/period-key helpers) and `apps/worker/src/match-tracker.test.ts`'s "Daily challenges (integration)" block (generation dedup, kills progress + exactly-once completion, kill_streak + XP folding, matches_played, and a dedicated test proving kill_streak resets at a Match boundary while kills_without_dying keeps counting). Full suite (275 tests) and typecheck pass.
