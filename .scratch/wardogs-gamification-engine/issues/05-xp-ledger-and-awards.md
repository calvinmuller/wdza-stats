# 05: XP ledger + XP awards

**What to build:** An immutable `xp_transactions` ledger and the Progression Engine logic that awards XP for kills, match completion, match wins, first blood, and kill-streak milestones (3/5/10), using a config-driven `XP_REWARDS` table seeded with the spec's defaults (kill +100, match completed +250, match win +500, first blood +100, streak3 +150, streak5 +250, streak10 +500) rather than hardcoded values. Each award is one ledger row keyed to the GameEvent that caused it, so the same event can never award XP twice even if reprocessed. `playerCareerStats.xp` is a cached running total, kept in sync with the ledger, used for fast leaderboard reads — the ledger remains the source of truth.

**Blocked by:** 02: Match lifecycle + kill/death events, 04: Kill streak tracking

**Status:** ready-for-agent

- [ ] `xp_transactions` records one row per award (steamId, amount, reason, eventId, createdAt), with a uniqueness guarantee on (eventId, reason) or equivalent so double-processing never double-awards
- [ ] `XP_REWARDS` values live in a config table/row, not inline in application logic
- [ ] Kills, match completion, match wins, first blood, and each streak milestone (3/5/10) award the correct configured amount exactly once
- [ ] `playerCareerStats.xp` always equals the sum of that player's ledger entries for that Server
- [ ] Tests cover: a kill awarding XP once even if the triggering event is reprocessed, first blood firing only for the actual first kill of a Match, and each streak milestone firing exactly once as the streak crosses it
