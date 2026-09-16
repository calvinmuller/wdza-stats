CREATE TABLE "banned_players" (
	"steam_id" text PRIMARY KEY NOT NULL,
	"reason" text,
	"banned_at" timestamp with time zone DEFAULT now() NOT NULL
);
