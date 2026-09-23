CREATE TABLE "kick_vote_ballots" (
	"kick_vote_id" integer NOT NULL,
	"session_id" text NOT NULL,
	"cast_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kick_vote_ballots_kick_vote_id_session_id_pk" PRIMARY KEY("kick_vote_id","session_id")
);
--> statement-breakpoint
CREATE TABLE "kick_vote_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"threshold_ballots" integer NOT NULL,
	"duration_seconds" integer NOT NULL,
	"initiator_cooldown_seconds" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kick_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"server_id" integer NOT NULL,
	"target_steam_id" text NOT NULL,
	"target_name" text NOT NULL,
	"reason" text NOT NULL,
	"initiator_session_id" text NOT NULL,
	"threshold" integer NOT NULL,
	"duration_seconds" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"resolved_at" timestamp with time zone,
	"cancelled_by_staff_member_id" text
);
--> statement-breakpoint
ALTER TABLE "kick_vote_ballots" ADD CONSTRAINT "kick_vote_ballots_kick_vote_id_kick_votes_id_fk" FOREIGN KEY ("kick_vote_id") REFERENCES "public"."kick_votes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kick_votes" ADD CONSTRAINT "kick_votes_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kick_votes" ADD CONSTRAINT "kick_votes_cancelled_by_staff_member_id_staff_members_id_fk" FOREIGN KEY ("cancelled_by_staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kick_votes_one_active_per_server_idx" ON "kick_votes" USING btree ("server_id") WHERE "kick_votes"."status" = 'active';--> statement-breakpoint
CREATE INDEX "kick_votes_initiator_session_idx" ON "kick_votes" USING btree ("initiator_session_id","started_at");--> statement-breakpoint
-- Seed the singleton KICK_VOTE_SETTINGS row with the grilled-out defaults
-- (25 Ballots, 5 minutes, 10 minute per-initiator cooldown), editable later
-- like every other config table here. ON CONFLICT DO NOTHING so this
-- migration stays re-runnable.
INSERT INTO "kick_vote_settings" ("id", "threshold_ballots", "duration_seconds", "initiator_cooldown_seconds") VALUES
	(1, 25, 300, 600)
ON CONFLICT ("id") DO NOTHING;