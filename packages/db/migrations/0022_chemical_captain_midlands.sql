CREATE TABLE "kills" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"server_id" integer NOT NULL,
	"event_id" text NOT NULL,
	"instance_id" text NOT NULL,
	"game_match_id" text NOT NULL,
	"match_row" integer,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_time" real NOT NULL,
	"map" text NOT NULL,
	"killer_steam_id" text,
	"killer_name" text,
	"killer_faction" text,
	"victim_steam_id" text NOT NULL,
	"victim_name" text NOT NULL,
	"victim_faction" text,
	"cause" text,
	"distance_m" real,
	"headshot" boolean DEFAULT false NOT NULL,
	"suicide" boolean DEFAULT false NOT NULL,
	"tags" jsonb NOT NULL,
	CONSTRAINT "kills_server_event_unique" UNIQUE("server_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "kills" ADD CONSTRAINT "kills_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kills_killer_idx" ON "kills" USING btree ("killer_steam_id");--> statement-breakpoint
CREATE INDEX "kills_victim_idx" ON "kills" USING btree ("victim_steam_id");