-- Game server bans are now copied from Warcon instead of RCON /v1/bans. The
-- Worker's next Warcon sync deletes any of these Warcon no longer lists.
UPDATE "banned_players" SET "source" = 'warcon' WHERE "source" = 'server';
