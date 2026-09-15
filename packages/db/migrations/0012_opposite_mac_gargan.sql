CREATE TABLE "challenge_completions" (
	"instance_id" integer NOT NULL,
	"steam_id" text NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_completions_instance_id_steam_id_pk" PRIMARY KEY("instance_id","steam_id")
);
--> statement-breakpoint
CREATE TABLE "challenge_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"scope" text NOT NULL,
	"target" integer NOT NULL,
	"xp_reward" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_instances" (
	"id" serial PRIMARY KEY NOT NULL,
	"definition_id" integer NOT NULL,
	"server_id" integer NOT NULL,
	"period_key" text NOT NULL,
	CONSTRAINT "challenge_instances_definition_id_server_id_period_key_unique" UNIQUE("definition_id","server_id","period_key")
);
--> statement-breakpoint
CREATE TABLE "player_challenge_progress" (
	"instance_id" integer NOT NULL,
	"steam_id" text NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "player_challenge_progress_instance_id_steam_id_pk" PRIMARY KEY("instance_id","steam_id")
);
--> statement-breakpoint
ALTER TABLE "xp_transactions" DROP CONSTRAINT "xp_transactions_event_id_reason_steam_id_unique";--> statement-breakpoint
ALTER TABLE "xp_transactions" ADD COLUMN "challenge_instance_id" integer;--> statement-breakpoint
ALTER TABLE "challenge_completions" ADD CONSTRAINT "challenge_completions_instance_id_challenge_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."challenge_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_instances" ADD CONSTRAINT "challenge_instances_definition_id_challenge_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."challenge_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_instances" ADD CONSTRAINT "challenge_instances_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_challenge_progress" ADD CONSTRAINT "player_challenge_progress_instance_id_challenge_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."challenge_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_challenge_instance_id_challenge_instances_id_fk" FOREIGN KEY ("challenge_instance_id") REFERENCES "public"."challenge_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "xp_transactions_event_reason_steam_idx" ON "xp_transactions" USING btree ("event_id","reason","steam_id") WHERE "xp_transactions"."reason" <> 'challenge_completed';--> statement-breakpoint
CREATE UNIQUE INDEX "xp_transactions_challenge_completion_idx" ON "xp_transactions" USING btree ("event_id","steam_id","challenge_instance_id") WHERE "xp_transactions"."reason" = 'challenge_completed';--> statement-breakpoint
-- Seed one daily ChallengeDefinition per ChallengeType with starting
-- defaults (not specified in spec.md - a reasonable starting point, editable
-- later like every other config table here). ON CONFLICT DO NOTHING so this
-- migration stays re-runnable; there's no natural-key column to conflict on
-- here (id is a bare serial), so this only actually protects a re-run of
-- this exact migration, not a later hand-added duplicate row - operators
-- adding more definitions of the same type is an intended, supported case.
INSERT INTO "challenge_definitions" ("type", "scope", "target", "xp_reward")
SELECT * FROM (VALUES
	('kills', 'daily', 15, 300),
	('wins', 'daily', 2, 400),
	('matches_played', 'daily', 3, 200),
	('kill_streak', 'daily', 5, 350),
	('kills_in_match', 'daily', 10, 400),
	('kills_without_dying', 'daily', 8, 400)
) AS seed(type, scope, target, xp_reward)
WHERE NOT EXISTS (SELECT 1 FROM "challenge_definitions");