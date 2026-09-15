CREATE TABLE "mvp_formula_weights" (
	"component" text PRIMARY KEY NOT NULL,
	"weight" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "mvp_player_steam_id" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "mvp_score" integer;--> statement-breakpoint
-- Seed MVP_FORMULA_WEIGHTS' default from spec.md's Domain Decisions
-- (kills x10 - deaths x5). ON CONFLICT DO NOTHING so this migration stays
-- re-runnable and never clobbers a weight an operator has since retuned by
-- hand.
INSERT INTO "mvp_formula_weights" ("component", "weight") VALUES
	('kills', 10),
	('deaths', -5)
ON CONFLICT ("component") DO NOTHING;