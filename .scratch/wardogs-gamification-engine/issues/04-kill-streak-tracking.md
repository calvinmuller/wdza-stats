# 04: Kill streak tracking

**What to build:** Persistent kill-streak state per player per Server, driven by `PlayerKilled`/`PlayerDeath` events. Each kill increments `currentKillStreak` and, if it's a new high, `highestKillStreak`, on that player's `playerCareerStats` row (added in ticket 01) — persisted in the database, not held in worker memory, so a worker restart never loses streak state. Each death resets `currentKillStreak` to 0. `PlayerKillStreakStarted` fires on a player's first kill of a streak (streak reaches 1), `PlayerKillStreakIncreased` on subsequent kills, `PlayerKillStreakBroken` on the death that ends a streak of at least 1. A new Match always resets `currentKillStreak` to 0 for every player, regardless of how their previous Match ended.

**Blocked by:** 02: Match lifecycle + kill/death events

**Status:** closed

- [x] `currentKillStreak`/`highestKillStreak` update correctly and durably on every `PlayerKilled`/`PlayerDeath`
- [x] `PlayerKillStreakStarted`, `PlayerKillStreakIncreased`, and `PlayerKillStreakBroken` fire at the correct points, exactly once each
- [x] `MatchStarted` resets every player's `currentKillStreak` to 0, even for a player mid-streak when the previous Match ended
- [x] Restarting the worker mid-Match and resuming polling does not lose or reset an in-progress streak
- [x] Tests cover: building a streak, a death breaking it, a Match boundary resetting it, and a worker-restart scenario preserving it

## Comments

Closed: `PlayerKillStreakStarted`/`Increased`/`Broken` added to `GameEventType` (`packages/db/src/game-event.ts`); no migration needed since `currentKillStreak`/`highestKillStreak` already exist on `playerCareerStats` from ticket 01. New pure `diffKillStreakGameEvents` in `apps/worker/src/game-events.ts`, wired into `ingestSnapshot` in `apps/worker/src/match-tracker.ts` under the same `!isBoundary` guard as kill/death and faction-score diffing.

Unlike every other event type in this file, a kill streak can't be derived from two consecutive Snapshots alone - it depends on state read from `playerCareerStats` (durable, not worker memory, satisfying the restart requirement) that a player may not even have a row for yet (their first Match hasn't closed). `applyKillStreakUpdates` upserts `currentKillStreak`/`highestKillStreak` per affected player, raising `highestKillStreak` via `GREATEST` rather than overwriting it. The Match-boundary reset is a single `UPDATE ... WHERE serverId = X SET currentKillStreak = 0`, covering every player on the Server (not just the closing Match's roster), matching "regardless of how their previous Match ended."

Reviewed via `/code-review` against spec.md/this ticket and the repo's standards/smell baseline, both fixed:
- **Spec axis**: flagged that `PlayerKillStreakStarted`/`Increased`'s idempotencyKey was built from the draft's own `type`, but that `type` depends on mutable `currentStreaks` state rather than being fully determined by the Snapshot pair - so two computations of the same kill against differing streak state could resolve to different types and dodge the unique-constraint dedup entirely. Fixed by keying both under one shared label (`KILL_STREAK_PROGRESS_KEY_TYPE`) instead of the real `type`, with a regression test asserting Started and Increased drafts for the same kill share an idempotencyKey.
- **Standards axis**: flagged that the kills/deaths loops inlined two duplicated 9-field `GameEventDraft` literals instead of factoring a one-event helper, unlike every sibling diff function in this file. Fixed by extracting `killStreakEvent`. Also flagged `KillStreakUpdate.highestKillStreakReached` breaking the 1:1 field-name-to-column convention used elsewhere; renamed to `highestKillStreak`.

Full test suite (186 tests) and typecheck pass.
