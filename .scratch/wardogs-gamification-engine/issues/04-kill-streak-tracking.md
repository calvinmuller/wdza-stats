# 04: Kill streak tracking

**What to build:** Persistent kill-streak state per player per Server, driven by `PlayerKilled`/`PlayerDeath` events. Each kill increments `currentKillStreak` and, if it's a new high, `highestKillStreak`, on that player's `playerCareerStats` row (added in ticket 01) — persisted in the database, not held in worker memory, so a worker restart never loses streak state. Each death resets `currentKillStreak` to 0. `PlayerKillStreakStarted` fires on a player's first kill of a streak (streak reaches 1), `PlayerKillStreakIncreased` on subsequent kills, `PlayerKillStreakBroken` on the death that ends a streak of at least 1. A new Match always resets `currentKillStreak` to 0 for every player, regardless of how their previous Match ended.

**Blocked by:** 02: Match lifecycle + kill/death events

**Status:** ready-for-agent

- [ ] `currentKillStreak`/`highestKillStreak` update correctly and durably on every `PlayerKilled`/`PlayerDeath`
- [ ] `PlayerKillStreakStarted`, `PlayerKillStreakIncreased`, and `PlayerKillStreakBroken` fire at the correct points, exactly once each
- [ ] `MatchStarted` resets every player's `currentKillStreak` to 0, even for a player mid-streak when the previous Match ended
- [ ] Restarting the worker mid-Match and resuming polling does not lose or reset an in-progress streak
- [ ] Tests cover: building a streak, a death breaking it, a Match boundary resetting it, and a worker-restart scenario preserving it
