CREATE TABLE "latest_snapshots" (
	"server_id" integer PRIMARY KEY NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latest_snapshots" ADD CONSTRAINT "latest_snapshots_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE no action ON UPDATE no action;