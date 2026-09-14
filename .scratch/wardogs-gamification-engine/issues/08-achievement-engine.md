# 08: Achievement engine

**What to build:** The 7 initial achievements (First Blood, Killing Spree, Rampage, War Machine, Veteran, Champion, Survivor), each checked against the relevant GameEvents/engine outputs and unlocked at most once per player per Server. Unlocking writes a `PlayerAchievement` row (steamId, achievementId, unlockedAt) and emits `AchievementUnlocked`. Achievement definitions are data, not one-off conditionals scattered through event handlers.

**Blocked by:** 02: Match lifecycle + kill/death events, 04: Kill streak tracking, 07: Match finalization: MVP + win/loss rollup

**Status:** ready-for-agent

- [ ] All 7 initial achievements are implemented: First Blood (first kill), Killing Spree (5 streak), Rampage (10 streak), War Machine (25 kills in one Match), Veteran (100 Matches played), Champion (25 Match wins), Survivor (complete a Match without dying)
- [ ] Each achievement unlocks at most once per steamId per Server, even if the qualifying condition is met again later or the triggering event is reprocessed
- [ ] `AchievementUnlocked` fires exactly once per unlock
- [ ] Achievement definitions are stored as data (thresholds, names, descriptions), not hardcoded per-achievement branches
- [ ] Tests cover: each achievement unlocking once, and at least one achievement's trigger condition recurring without a duplicate unlock
