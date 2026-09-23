CREATE TABLE "verified_player_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"steam_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verified_players" (
	"steam_id" text PRIMARY KEY NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_signed_in_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verified_player_sessions" ADD CONSTRAINT "verified_player_sessions_steam_id_verified_players_steam_id_fk" FOREIGN KEY ("steam_id") REFERENCES "public"."verified_players"("steam_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verified_player_sessions_steam_id_idx" ON "verified_player_sessions" USING btree ("steam_id");