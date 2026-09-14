# 01: Event log foundation + player join/leave detection

**What to build:** A persistent, idempotent log of GameEvents that every later gamification engine will read from, proven end-to-end with the simplest event type: a player joining or leaving. After each poll, comparing the current roster to the previous one produces `PlayerJoined`/`PlayerLeft` GameEvents, persisted exactly once even if the same snapshot comparison is retried. This ticket also adds the new gamification columns to `playerCareerStats` (`xp`, `level`, `matchesWon`, `matchesLost`, `highestKillStreak`, `currentKillStreak`, `mvpCount`, all defaulting appropriately) so every later ticket has a home for its data without another migration.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A `game_events` table exists with fields sufficient to process an event later (id, serverId, matchId, type, timestamp, steamId, targetSteamId, faction, metadata, sourceSnapshotId) and a deterministic idempotency key
- [ ] `playerCareerStats` has the new columns; existing rows get sane defaults (0 / null as appropriate) via the migration
- [ ] The worker emits `PlayerJoined` for a steamId present in the current roster but absent from the previous one, and `PlayerLeft` for the reverse — no debounce, every roster diff is taken literally
- [ ] Re-running the same snapshot comparison (e.g. after a worker retry) never creates duplicate events for the same transition
- [ ] Tests cover: a normal join, a normal leave, and a retried/duplicate poll producing no extra rows — following the existing `scriptedRconClient`/fixture pattern used in `apps/worker/src/match-tracker.test.ts`
