CREATE SEQUENCE "public"."servers_slug_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "slug" text DEFAULT 'server-' || nextval('servers_slug_seq') NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "rcon_token" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- The Server this deployment already tracks gets a slug made from its name
-- (e.g. "wdza-wardogs-south-africa-community-server"), which an admin can
-- shorten in /admin/servers. A name with nothing usable keeps "server-N".
UPDATE "servers" SET "slug" = "derived"."slug"
FROM (
	SELECT "id", trim(both '-' from left(regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g'), 40)) AS "slug"
	FROM "servers"
) AS "derived"
WHERE "derived"."id" = "servers"."id" AND "derived"."slug" <> '';--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_slug_unique" UNIQUE("slug");