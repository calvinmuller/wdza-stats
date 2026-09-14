CREATE TABLE "xp_rewards" (
	"reason" text PRIMARY KEY NOT NULL,
	"amount" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xp_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"server_id" integer NOT NULL,
	"steam_id" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"event_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "xp_transactions_event_id_reason_steam_id_unique" UNIQUE("event_id","reason","steam_id")
);
--> statement-breakpoint
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_event_id_game_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."game_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Seed XP_REWARDS' defaults from spec.md's Domain Decisions. ON CONFLICT DO
-- NOTHING so this migration stays re-runnable and never clobbers an amount
-- an operator has since retuned by hand.
INSERT INTO "xp_rewards" ("reason", "amount") VALUES
	('kill', 100),
	('match_completed', 250),
	('match_win', 500),
	('first_blood', 100),
	('streak3', 150),
	('streak5', 250),
	('streak10', 500)
ON CONFLICT ("reason") DO NOTHING;