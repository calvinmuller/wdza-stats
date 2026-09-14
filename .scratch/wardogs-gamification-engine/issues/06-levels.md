# 06: Levels + level-up events

**What to build:** A configurable level curve (table or formula, seeded with the spec's defaults: level 1 = 0 XP, level 2 = 1,000, level 3 = 2,500, level 4 = 4,500, …) that derives a player's current level, XP required for the next level, and progress percentage from their cached `playerCareerStats.xp` total. Whenever an XP award (from ticket 05) crosses a level threshold, persist the new `level` on `playerCareerStats` and emit a `PlayerLevelUp` GameEvent exactly once per level gained (a big XP award that crosses two levels at once still emits one event per level crossed).

**Blocked by:** 05: XP ledger + XP awards

**Status:** ready-for-agent

- [ ] The level curve is config-driven, not hardcoded per-level UI logic
- [ ] A helper/query exposes current level, XP into current level, XP required for next level, and progress percentage for any player
- [ ] `playerCareerStats.level` stays in sync with `xp` after every award
- [ ] `PlayerLevelUp` fires once per level gained, including when a single award crosses multiple level thresholds
- [ ] Tests cover: an award that doesn't cross a threshold (no event), one that crosses exactly one, and one that crosses two at once
