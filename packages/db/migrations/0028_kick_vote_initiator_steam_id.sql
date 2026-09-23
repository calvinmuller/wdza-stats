DROP INDEX "kick_votes_initiator_session_idx";--> statement-breakpoint
ALTER TABLE "kick_votes" ALTER COLUMN "initiator_session_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "kick_votes" ADD COLUMN "initiator_steam_id" text;--> statement-breakpoint
CREATE INDEX "kick_votes_initiator_steam_id_idx" ON "kick_votes" USING btree ("initiator_steam_id","started_at");