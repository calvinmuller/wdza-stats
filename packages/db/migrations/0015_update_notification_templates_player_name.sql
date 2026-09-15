-- Custom SQL migration file, put your code below! --
-- Retunes the default notification_rules templates seeded in 0013 to use the
-- new {{playerName}} template var (playerCareerStats.displayName, see
-- notification-engine.ts) instead of the raw {{steamId}}, since a Steam64 ID
-- is unreadable in a Discord/notification feed. Each UPDATE is guarded by the
-- exact original seeded template text so an operator who has since retuned a
-- rule by hand is left untouched, matching 0013's own "never clobbers a rule
-- an operator has since retuned" convention.
UPDATE "notification_rules" SET "template" = '🏅 {{playerName}} unlocked an achievement: {{achievementName}}!' WHERE "kind" = 'AchievementUnlocked' AND "template" = '🏅 {{steamId}} unlocked an achievement: {{achievementName}}!';--> statement-breakpoint
UPDATE "notification_rules" SET "template" = '🔥 {{playerName}} is on a 10 kill streak!' WHERE "kind" = 'KillStreak10' AND "template" = '🔥 {{steamId}} is on a 10 kill streak!';--> statement-breakpoint
UPDATE "notification_rules" SET "template" = '✅ {{playerName}} completed a daily challenge: {{challengeType}}!' WHERE "kind" = 'ChallengeCompleted' AND "template" = '✅ {{steamId}} completed a daily challenge: {{challengeType}}!';--> statement-breakpoint
UPDATE "notification_rules" SET "template" = '⚡ {{playerName}} hit a 5 kill streak!' WHERE "kind" = 'KillStreak5' AND "template" = '⚡ {{steamId}} hit a 5 kill streak!';--> statement-breakpoint
UPDATE "notification_rules" SET "template" = '⬆️ {{playerName}} leveled up to level {{level}}!' WHERE "kind" = 'PlayerLevelUp' AND "template" = '⬆️ {{steamId}} leveled up to level {{level}}!';--> statement-breakpoint
UPDATE "notification_rules" SET "template" = '🔫 {{playerName}} is on a 3 kill streak!' WHERE "kind" = 'KillStreak3' AND "template" = '🔫 {{steamId}} is on a 3 kill streak!';
