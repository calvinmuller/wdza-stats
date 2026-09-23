ALTER TABLE "staff_members" ADD COLUMN "steam_id" text;--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_steam_id_unique" UNIQUE("steam_id");