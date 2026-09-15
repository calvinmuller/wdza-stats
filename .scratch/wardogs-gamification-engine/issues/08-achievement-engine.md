# 08: Achievement engine

**What to build:** The 7 initial achievements (First Blood, Killing Spree, Rampage, War Machine, Veteran, Champion, Survivor), each checked against the relevant GameEvents/engine outputs and unlocked at most once per player per Server. Unlocking writes a `PlayerAchievement` row (steamId, achievementId, unlockedAt) and emits `AchievementUnlocked`. Achievement definitions are data, not one-off conditionals scattered through event handlers.

**Blocked by:** 02: Match lifecycle + kill/death events, 04: Kill streak tracking, 07: Match finalization: MVP + win/loss rollup

**Status:** closed

- [x] All 7 initial achievements are implemented: First Blood (first kill), Killing Spree (5 streak), Rampage (10 streak), War Machine (25 kills in one Match), Veteran (100 Matches played), Champion (25 Match wins), Survivor (complete a Match without dying)
- [x] Each achievement unlocks at most once per steamId per Server, even if the qualifying condition is met again later or the triggering event is reprocessed
- [x] `AchievementUnlocked` fires exactly once per unlock
- [x] Achievement definitions are stored as data (thresholds, names, descriptions), not hardcoded per-achievement branches
- [x] Tests cover: each achievement unlocking once, and at least one achievement's trigger condition recurring without a duplicate unlock

## Comments

Closed (commit `b3884c5`). New `achievement_definitions` (id, name, description, trigger, threshold) and `player_achievements` (server_id, steam_id, achievement_id, unlocked_at - PK on the triple) tables in `packages/db/src/schema.ts`, migration `0011_old_human_torch.sql` seeding the 7 achievements with `ON CONFLICT DO NOTHING`, matching xp_rewards/level_thresholds/mvp_formula_weights' config-table precedent. `AchievementTrigger` (`packages/db/src/achievement.ts`) names 6 trigger kinds (`first_kill`, `kill_streak`, `match_kills`, `matches_played`, `matches_won`, `survivor`); every definition's `threshold` is compared with plain equality against an observed counter, so a new Achievement is just a config row, never a new conditional branch.

`apps/worker/src/achievement-engine.ts`'s `computeAchievementUnlockDrafts` is a pure diff (mirroring xp-engine.ts's own shape): it reacts to `PlayerKilled` (first-kill/within-Match-kill-count triggers), `PlayerKillStreakStarted`/`Increased` (streak triggers), and `MatchEnded` (matches_played/matches_won/survivor triggers, off per-participant state a closed Match's `playerCareerStats`/`playerMatchStats` rows already carry). It has no memory of past unlocks - a recurring condition (e.g. a kill streak reaching 5, breaking, and reaching 5 again in the same Match) legitimately produces the same draft twice. Idempotency instead comes from `match-tracker.ts`'s `applyAchievementUnlockDrafts`, which inserts into `player_achievements` guarded by its own `(server_id, steam_id, achievement_id)` uniqueness via `onConflictDoNothing` - only genuinely-new rows go on to produce an `AchievementUnlocked` GameEvent (`achievementUnlockedEvents`), so the event fires at most once per unlock regardless of how many times the qualifying condition recurs or a triggering GameEvent is reprocessed. Wired into `ingestSnapshot` alongside the existing XP/level pipeline.

Verified via `apps/worker/src/achievement-engine.test.ts` (pure unit tests for all 7 achievements, including the recurring-kill-streak-without-duplicate case) and a new "Achievement engine (integration)" describe block in `apps/worker/src/match-tracker.test.ts` exercising `applyAchievementUnlockDrafts` against a real Postgres database (new unlock persisted, independent unlocks for the same player, and reprocessing/recurrence never double-unlocking). Full suite (275 tests, shared with ticket 09's concurrently-developed work) and typecheck pass.
