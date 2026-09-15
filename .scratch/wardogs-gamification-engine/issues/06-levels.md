# 06: Levels + level-up events

**What to build:** A configurable level curve (table or formula, seeded with the spec's defaults: level 1 = 0 XP, level 2 = 1,000, level 3 = 2,500, level 4 = 4,500, …) that derives a player's current level, XP required for the next level, and progress percentage from their cached `playerCareerStats.xp` total. Whenever an XP award (from ticket 05) crosses a level threshold, persist the new `level` on `playerCareerStats` and emit a `PlayerLevelUp` GameEvent exactly once per level gained (a big XP award that crosses two levels at once still emits one event per level crossed).

**Blocked by:** 05: XP ledger + XP awards

**Status:** closed

- [x] The level curve is config-driven, not hardcoded per-level UI logic
- [x] A helper/query exposes current level, XP into current level, XP required for next level, and progress percentage for any player
- [x] `playerCareerStats.level` stays in sync with `xp` after every award
- [x] `PlayerLevelUp` fires once per level gained, including when a single award crosses multiple level thresholds
- [x] Tests cover: an award that doesn't cross a threshold (no event), one that crosses exactly one, and one that crosses two at once

## Comments

Closed: new `level_thresholds` config table (level -> cumulative xpRequired) in `packages/db/src/schema.ts`, migration `0009_left_blob.sql` seeding levels 1-100 via the quadratic pattern the spec's 0/1,000/2,500/4,500 sequence implies (each level's own XP increment is `500 * level`, i.e. `xpRequired(N) = xpRequired(N-1) + 500*N`, closed form `250*N*(N+1) - 500`), via `INSERT ... ON CONFLICT DO NOTHING` matching ticket 05's re-runnable seeding convention. Pure curve math (`levelForXp`, `levelProgressForXp` - the "current level / XP into level / XP required for next level / progress%" helper) lives in `packages/db/src/level.ts`, reusable by any future consumer (e.g. ticket 12's player profile page), not just the worker.

New `apps/worker/src/level-engine.ts` builds `PlayerLevelUp` GameEventDrafts (one per level gained between a `previousLevel` and `newLevel` the caller already resolved), wired into `ingestSnapshot` in `apps/worker/src/match-tracker.ts` via a new `applyLevelUps`: after XP transactions are applied for a poll, every player who actually gained XP that poll is checked against `level_thresholds`, and if their cached `xp` now resolves to a higher level than the `level` column currently on file, that column and the `PlayerLevelUp` events are persisted in the same DB transaction - so `playerCareerStats.level` can never drift out of sync with `xp`, even across a crash between the two.

Reviewed via `/code-review` against spec.md/this ticket and the repo's standards/smell baseline (both axes run as parallel sub-agents), spec axis found no missing/wrong requirements and no scope creep. Standards axis found no hard violations but three judgement-call smells, all fixed:
- **Duplicated Code**: the `gameEvents` insert-and-return block appeared twice in `ingestSnapshot` (once for the Snapshot-diff batch, once for the `PlayerLevelUp` batch). Extracted a shared `insertGameEventDrafts` helper.
- **Mysterious Name**: `RosterDiffContext` (the shared `{serverId, matchId, timestamp, sourceSnapshotId}` context type in `game-events.ts`) no longer only served roster-diffing once `level-engine.ts` reused it - renamed to `GameEventContext` throughout, with its doc comment updated to name both callers.
- **Trivial duplicate computation**: `applyLevelUps` and `levelUpEvents` each independently called `levelForXp` for the same value. `levelUpEvents` now takes the caller's already-resolved `newLevel` directly instead of recomputing it from `newXp`/`thresholds`.

Full test suite (220 tests, up from 203) and typecheck pass.
