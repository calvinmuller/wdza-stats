CREATE TABLE "match_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_snapshots" ADD CONSTRAINT "match_snapshots_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;