-- Custom SQL migration file, put your code below! --
-- Seeds the FirstBlood NotificationKind (packages/db/src/notification.ts):
-- fires once per Match, for the single PlayerKilled GameEvent that is that
-- Match's earliest kill (see notification-engine.ts's firstBloodDraft).
-- "high" priority, matching MatchStarted/MatchEnded/AchievementUnlocked -
-- a once-per-match milestone that should never be dropped by the
-- low/normal throttle. ON CONFLICT DO NOTHING, matching 0013's convention,
-- so this migration stays re-runnable and never clobbers a rule an operator
-- has since retuned by hand.
INSERT INTO "notification_rules" ("kind", "priority", "template") VALUES
	('FirstBlood', 'high', '🩸 {{playerName}} drew first blood!')
ON CONFLICT ("kind") DO NOTHING;
