CREATE TABLE "steam_achievement_schema" (
	"app_id" integer NOT NULL,
	"api_name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"icon_url" text NOT NULL,
	CONSTRAINT "steam_achievement_schema_app_id_api_name_pk" PRIMARY KEY("app_id","api_name")
);
--> statement-breakpoint
CREATE TABLE "steam_profiles" (
	"steam_id" text PRIMARY KEY NOT NULL,
	"persona_name" text,
	"avatar_url" text,
	"achievements" jsonb NOT NULL,
	"status" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
