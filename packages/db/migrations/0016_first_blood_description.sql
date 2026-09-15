-- Custom SQL migration file, put your code below! --
-- Retunes 0011's seeded "First Blood" description: the achievement (trigger
-- first_kill, threshold 1) was ambiguous about whether it meant a player's
-- own first-ever kill or the Match's opening kill - achievement-engine.ts
-- has always meant the latter (whoever lands the Match's threshold-th kill,
-- across every player), which the old wording didn't make clear. Guarded by
-- the exact original seeded description so an operator who has since
-- retuned it by hand is left untouched, matching 0015's own convention.
UPDATE "achievement_definitions" SET "description" = 'Get the first kill of the game' WHERE "id" = 'first_blood' AND "description" = 'Get your first kill';
