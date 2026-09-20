ALTER TABLE "servers" ADD COLUMN "feed_token_hash" text;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_feed_token_hash_unique" UNIQUE("feed_token_hash");