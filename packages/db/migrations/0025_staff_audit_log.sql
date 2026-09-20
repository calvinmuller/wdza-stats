CREATE TABLE "staff_audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"staff_member_id" text,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "staff_audit_log_created_idx" ON "staff_audit_log" USING btree ("created_at");