# 10: Notification recording + throttling

**What to build:** The Notification Service: a policy that decides which GameEvents/engine outputs (match start/end, achievement unlocks, 10+ kill streaks, challenge completions) are "important" enough to record immediately, versus routine ones (every single kill, small XP gains) that get suppressed entirely rather than spamming a feed. Per ADR 0003, this ticket records `Notification` rows for the dashboard's recent-events feed only — it never calls RCON and never sends anything to the game server.

**Blocked by:** 02: Match lifecycle + kill/death events, 04: Kill streak tracking, 08: Achievement engine, 09: Daily challenges

**Status:** ready-for-agent

- [ ] A `Notification` model records priority, message (from a configurable template), source event/eventId, and timestamp
- [ ] High-priority events (MatchStarted, MatchEnded, AchievementUnlocked, 10+ streak, challenge completion) always produce a Notification
- [ ] Routine events (individual kills, small XP gains) never produce a Notification — the system must not record one notification per kill
- [ ] A configurable max-per-minute cap exists and suppresses excess low/normal-priority notifications without dropping high-priority ones
- [ ] No code path in this ticket calls the RCON client or any write endpoint
- [ ] Tests cover: a full Match fixture producing the expected small set of high-priority notifications and correctly suppressing kill noise
