CREATE TABLE "game_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"server_id" integer NOT NULL,
	"match_id" integer NOT NULL,
	"type" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"steam_id" text NOT NULL,
	"target_steam_id" text,
	"faction" text,
	"metadata" jsonb,
	"source_snapshot_id" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	CONSTRAINT "game_events_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "player_career_stats" ADD COLUMN "xp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_career_stats" ADD COLUMN "level" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_career_stats" ADD COLUMN "matches_won" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_career_stats" ADD COLUMN "matches_lost" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_career_stats" ADD COLUMN "highest_kill_streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_career_stats" ADD COLUMN "current_kill_streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_career_stats" ADD COLUMN "mvp_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;