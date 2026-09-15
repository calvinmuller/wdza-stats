CREATE TABLE "achievement_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"trigger" text NOT NULL,
	"threshold" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_achievements" (
	"server_id" integer NOT NULL,
	"steam_id" text NOT NULL,
	"achievement_id" text NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_achievements_server_id_steam_id_achievement_id_pk" PRIMARY KEY("server_id","steam_id","achievement_id")
);
--> statement-breakpoint
ALTER TABLE "player_achievements" ADD CONSTRAINT "player_achievements_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_achievements" ADD CONSTRAINT "player_achievements_achievement_id_achievement_definitions_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievement_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Seed the 7 initial Achievements from ticket 08. ON CONFLICT DO NOTHING so
-- this migration stays re-runnable and never clobbers a definition an
-- operator has since retuned by hand.
INSERT INTO "achievement_definitions" ("id", "name", "description", "trigger", "threshold") VALUES
	('first_blood', 'First Blood', 'Get your first kill', 'first_kill', 1),
	('killing_spree', 'Killing Spree', 'Reach a 5 kill streak', 'kill_streak', 5),
	('rampage', 'Rampage', 'Reach a 10 kill streak', 'kill_streak', 10),
	('war_machine', 'War Machine', 'Get 25 kills in a single Match', 'match_kills', 25),
	('veteran', 'Veteran', 'Play 100 Matches', 'matches_played', 100),
	('champion', 'Champion', 'Win 25 Matches', 'matches_won', 25),
	('survivor', 'Survivor', 'Complete a Match without dying', 'survivor', 0)
ON CONFLICT ("id") DO NOTHING;