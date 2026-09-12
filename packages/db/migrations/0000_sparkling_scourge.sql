CREATE TABLE "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"server_id" integer NOT NULL,
	"map" text NOT NULL,
	"experiences" text[] NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "player_career_stats" (
	"server_id" integer NOT NULL,
	"steam_id" text NOT NULL,
	"display_name" text NOT NULL,
	"kills" integer DEFAULT 0 NOT NULL,
	"deaths" integer DEFAULT 0 NOT NULL,
	"cash" integer DEFAULT 0 NOT NULL,
	"matches_played" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "player_career_stats_server_id_steam_id_pk" PRIMARY KEY("server_id","steam_id")
);
--> statement-breakpoint
CREATE TABLE "player_match_stats" (
	"match_id" integer NOT NULL,
	"steam_id" text NOT NULL,
	"faction" text NOT NULL,
	"kills" integer NOT NULL,
	"deaths" integer NOT NULL,
	"cash" integer NOT NULL,
	CONSTRAINT "player_match_stats_match_id_steam_id_pk" PRIMARY KEY("match_id","steam_id")
);
--> statement-breakpoint
CREATE TABLE "servers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	CONSTRAINT "servers_base_url_unique" UNIQUE("base_url")
);
--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_career_stats" ADD CONSTRAINT "player_career_stats_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_match_stats" ADD CONSTRAINT "player_match_stats_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;