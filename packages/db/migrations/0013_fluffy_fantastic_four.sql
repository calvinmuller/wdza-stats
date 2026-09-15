CREATE TABLE "notification_rules" (
	"kind" text PRIMARY KEY NOT NULL,
	"priority" text NOT NULL,
	"template" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"max_low_normal_per_minute" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"server_id" integer NOT NULL,
	"priority" text NOT NULL,
	"message" text NOT NULL,
	"event_id" integer NOT NULL,
	"timestamp" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_game_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."game_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Seed the NotificationKind catalog from ticket 10: MatchStarted/MatchEnded/
-- AchievementUnlocked/KillStreak10/ChallengeCompleted are "high" priority
-- (always recorded, never throttled - see spec's Domain Decisions on ADR
-- 0003 and notification-engine.ts's applyNotificationThrottle);
-- KillStreak5/PlayerLevelUp are "normal"; KillStreak3 is "low" - both tiers
-- share the configured max-per-minute cap in notification_settings. ON
-- CONFLICT DO NOTHING so this migration stays re-runnable and never clobbers
-- a rule an operator has since retuned by hand.
INSERT INTO "notification_rules" ("kind", "priority", "template") VALUES
	('MatchStarted', 'high', '🏁 Match started on {{map}}!'),
	('MatchEnded', 'high', '🏆 Match ended - {{winner}} wins!'),
	('AchievementUnlocked', 'high', '🏅 {{steamId}} unlocked an achievement: {{achievementName}}!'),
	('KillStreak10', 'high', '🔥 {{steamId}} is on a 10 kill streak!'),
	('ChallengeCompleted', 'high', '✅ {{steamId}} completed a daily challenge: {{challengeType}}!'),
	('KillStreak5', 'normal', '⚡ {{steamId}} hit a 5 kill streak!'),
	('PlayerLevelUp', 'normal', '⬆️ {{steamId}} leveled up to level {{level}}!'),
	('KillStreak3', 'low', '🔫 {{steamId}} is on a 3 kill streak!')
ON CONFLICT ("kind") DO NOTHING;--> statement-breakpoint
-- Seed the singleton NOTIFICATION_SETTINGS row with a starting max-per-minute
-- cap (not specified in spec.md - a reasonable starting point, editable
-- later like every other config table here). ON CONFLICT DO NOTHING so this
-- migration stays re-runnable.
INSERT INTO "notification_settings" ("id", "max_low_normal_per_minute") VALUES
	(1, 20)
ON CONFLICT ("id") DO NOTHING;