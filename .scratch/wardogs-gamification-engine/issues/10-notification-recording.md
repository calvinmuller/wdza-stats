# 10: Notification recording + throttling

**What to build:** The Notification Service: a policy that decides which GameEvents/engine outputs (match start/end, achievement unlocks, 10+ kill streaks, challenge completions) are "important" enough to record immediately, versus routine ones (every single kill, small XP gains) that get suppressed entirely rather than spamming a feed. Per ADR 0003, this ticket records `Notification` rows for the dashboard's recent-events feed only — it never calls RCON and never sends anything to the game server.

**Blocked by:** 02: Match lifecycle + kill/death events, 04: Kill streak tracking, 08: Achievement engine, 09: Daily challenges

**Status:** closed

- [x] A `Notification` model records priority, message (from a configurable template), source event/eventId, and timestamp
- [x] High-priority events (MatchStarted, MatchEnded, AchievementUnlocked, 10+ streak, challenge completion) always produce a Notification
- [x] Routine events (individual kills, small XP gains) never produce a Notification — the system must not record one notification per kill
- [x] A configurable max-per-minute cap exists and suppresses excess low/normal-priority notifications without dropping high-priority ones
- [x] No code path in this ticket calls the RCON client or any write endpoint
- [x] Tests cover: a full Match fixture producing the expected small set of high-priority notifications and correctly suppressing kill noise

## Comments

Closed: implemented on `master` (commit `1654f14`). `packages/db/src/notification.ts` defines `NotificationPriority`/`NotificationKind` — a catalog deliberately distinct from `GameEventType`: most GameEvent types never produce a Notification at all, a kill streak's one GameEventType fans out into three kinds (KillStreak3/5/10, at low/normal/high priority respectively — matching the existing streak-milestone precedent in xp-engine.ts/achievement-engine.ts), and `ChallengeCompleted` has no GameEventType of its own (a Challenge completion produces a ChallengeCompletion row + an XpTransaction, never a GameEvent) so it's a Notification-only kind. `packages/db/src/schema.ts` adds `notification_rules` (kind -> priority + `{{placeholder}}` message template, config-driven and seeded in migration `0013_fluffy_fantastic_four.sql`), `notification_settings` (a singleton max-low/normal-per-minute cap, seeded to 20), and `notifications` (serverId, priority, message, eventId FK to game_events, timestamp).

`apps/worker/src/notification-engine.ts` is a pure diff (`computeNotificationDrafts`) from recorded GameEvents + Challenge completions + the NOTIFICATION_RULES config to Notification drafts — routine GameEvents (PlayerJoined/Left, PlayerKilled/Death, FactionScoreChanged, PlayerKillStreakBroken) are structurally excluded by the switch statement, not merely throttled, so "one notification per kill" is impossible rather than just suppressed. `applyNotificationThrottle` is a second pure function applying the max-per-minute cap: every "high" priority draft always survives; "low"/"normal" drafts survive only while a running count (seeded from the Server's trailing-60s low/normal count, gathered fresh by the caller) stays under the configured cap.

Wired into `match-tracker.ts`'s `ingestSnapshot` after the existing XP/Achievement/Challenge/Level pipeline (so it sees achievement unlocks and level-ups too, not just the poll's raw Snapshot diff): `buildNotificationContext` gathers achievement display names and the opened/closed Match's map/winner for message templates; `buildChallengeCompletionNotificationInfo` looks up each completed Challenge's own type; `fetchNotificationThrottleState` reads the configured cap plus the Server's trailing-60s low/normal count, keyed off the poll's own `capturedAt` rather than wall-clock time, so throttling is deterministic and testable. No dedupe guard is needed on the `notifications` table itself: every signal it reacts to (a genuinely newly-inserted GameEvent, or a genuinely new ChallengeCompletion row) is already deduplicated upstream by its own idempotency mechanism.

Per ADR 0003, no code path here calls RCON or any write endpoint — Notifications are recorded for the dashboard's recent-events feed only, never delivered to the game server.

Verified via `apps/worker/src/notification-engine.test.ts` (pure-function coverage of the priority classification, template rendering, and throttle logic) and `apps/worker/src/match-tracker.test.ts`'s new "Notification engine (integration)" block: one test runs a full Match (start -> a 10-kill streak in one poll -> end) and asserts the exact small set of 14 Notifications produced (10 high/3 normal/1 low) versus the far larger number of routine GameEvents the same run produced; another pre-fills a Server's trailing-minute budget and proves a low-priority draft is dropped while a simultaneous Match-boundary batch's high-priority drafts still land. Since `notifications.eventId` now FKs to `game_events.id`, every existing integration test's `afterEach` cleanup that deletes `game_events` was updated to delete `notifications` first. Full suite (295 tests) and typecheck pass.
