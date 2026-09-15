// Notification: a throttled, recorded representation of a noteworthy
// GameEvent or milestone, shown in the dashboard's recent-events feed - never
// delivered to the game server itself. See CONTEXT.md and
// docs/adr/0003-gamification-notifications-stay-off-rcon-writes.md.

// Which priority tier a NOTIFICATION_RULES config row holds. High-priority
// Notifications are never throttled (see
// apps/worker/src/notification-engine.ts's applyNotificationThrottle);
// low/normal share one configured max-per-minute cap.
export type NotificationPriority = "low" | "normal" | "high";

// The catalog of noteworthy occurrences the Notification Engine reacts to -
// deliberately not the same union as GameEventType (game-event.ts). Most
// GameEvent types (PlayerJoined/Left, PlayerKilled/Death,
// FactionScoreChanged, PlayerKillStreakBroken) never produce a Notification
// at all - see ticket 10's "routine events" requirement. A kill streak's own
// GameEventType (PlayerKillStreakStarted/Increased) fans out into three
// distinct kinds here rather than one: the milestone reached (3/5/10), not
// the raw event type, is what determines a streak Notification's priority
// and message - see apps/worker/src/notification-engine.ts. ChallengeCompleted
// has no GameEventType at all (completing a Challenge produces a
// ChallengeCompletion row and an XpTransaction, never a GameEvent - see
// challenge-engine.ts), so it's a Notification-only kind.
export type NotificationKind =
  | "MatchStarted"
  | "MatchEnded"
  | "AchievementUnlocked"
  | "KillStreak3"
  | "KillStreak5"
  | "KillStreak10"
  | "PlayerLevelUp"
  | "ChallengeCompleted";
