CREATE TABLE "player_season_stats" (
	"season_id" integer NOT NULL,
	"server_id" integer NOT NULL,
	"steam_id" text NOT NULL,
	"kills" integer DEFAULT 0 NOT NULL,
	"deaths" integer DEFAULT 0 NOT NULL,
	"cash" integer DEFAULT 0 NOT NULL,
	"matches_played" integer DEFAULT 0 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"matches_won" integer DEFAULT 0 NOT NULL,
	"matches_lost" integer DEFAULT 0 NOT NULL,
	"highest_kill_streak" integer DEFAULT 0 NOT NULL,
	"mvp_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "player_season_stats_season_id_server_id_steam_id_pk" PRIMARY KEY("season_id","server_id","steam_id")
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"name" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_number_unique" UNIQUE("number")
);
--> statement-breakpoint
-- Season 1 is everything played before Season 2 began, so it starts no later
-- than the earliest Match on record. Created here rather than by an admin so
-- that a current Season always exists.
INSERT INTO "seasons" ("number", "started_at")
SELECT 1, COALESCE(MIN("started_at"), now()) FROM "matches";
--> statement-breakpoint
-- The current Season is always the highest-numbered one (Seasons run back to
-- back). Used as matches.season_id's default so every Match is stamped with
-- the Season current when it opened, whichever code path inserts it.
CREATE FUNCTION current_season_id() RETURNS integer
LANGUAGE sql STABLE
AS $$ SELECT "id" FROM "seasons" ORDER BY "number" DESC LIMIT 1 $$;
--> statement-breakpoint
-- Every existing Match takes the default, i.e. lands in Season 1.
ALTER TABLE "matches" ADD COLUMN "season_id" integer DEFAULT current_season_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "player_season_stats" ADD CONSTRAINT "player_season_stats_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_season_stats" ADD CONSTRAINT "player_season_stats_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_season_stats_season_server_xp_idx" ON "player_season_stats" USING btree ("season_id","server_id","xp");--> statement-breakpoint
CREATE INDEX "player_season_stats_season_server_kills_idx" ON "player_season_stats" USING btree ("season_id","server_id","kills");--> statement-breakpoint
CREATE INDEX "player_season_stats_season_server_wins_idx" ON "player_season_stats" USING btree ("season_id","server_id","matches_won");--> statement-breakpoint
CREATE INDEX "player_season_stats_season_server_streak_idx" ON "player_season_stats" USING btree ("season_id","server_id","highest_kill_streak");--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Until Season 2 exists, every player's Season 1 totals are exactly their
-- career totals, so Season 1 is backfilled as a straight copy.
INSERT INTO "player_season_stats" (
	"season_id", "server_id", "steam_id", "kills", "deaths", "cash", "matches_played",
	"xp", "matches_won", "matches_lost", "highest_kill_streak", "mvp_count"
)
SELECT
	current_season_id(), "server_id", "steam_id", "kills", "deaths", "cash", "matches_played",
	"xp", "matches_won", "matches_lost", "highest_kill_streak", "mvp_count"
FROM "player_career_stats";
