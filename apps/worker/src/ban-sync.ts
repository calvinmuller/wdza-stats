import { bannedPlayers, type Database } from "@wdza-stats/db";
import { and, eq, notInArray, sql } from "drizzle-orm";
import type { RconClient } from "./rcon-client";

// The game server reports a ban from its config file with this placeholder
// date (0001-01-01) instead of a real one.
function knownBanDate(bannedAtUtc: string): Date | undefined {
  const date = new Date(bannedAtUtc);
  return Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1 ? undefined : date;
}

/**
 * Mirrors the game server's RCON /v1/bans list into banned_players as
 * `source: "server"` rows, so a player banned in-game is filtered and hidden
 * exactly like one a Staff Member banned (see schema.ts's bannedPlayers doc
 * comment). A "server" row the game server no longer lists is deleted; a
 * "site" row is never touched, even when the same steamId is on both lists.
 * Throws if RCON can't be read, leaving the last synced list in place.
 */
export async function syncServerBans(db: Database, client: RconClient): Promise<void> {
  const { bans } = await client.fetchBans();
  const steamIds = bans.map((ban) => ban.steamId);

  await db.transaction(async (tx) => {
    if (bans.length > 0) {
      await tx
        .insert(bannedPlayers)
        .values(
          bans.map((ban) => ({
            steamId: ban.steamId,
            reason: ban.reason,
            bannedAt: knownBanDate(ban.bannedAtUtc),
            source: "server" as const,
          })),
        )
        .onConflictDoUpdate({
          target: bannedPlayers.steamId,
          set: { reason: sql`excluded.reason` },
          setWhere: eq(bannedPlayers.source, "server"),
        });
    }

    await tx
      .delete(bannedPlayers)
      .where(
        steamIds.length > 0
          ? and(eq(bannedPlayers.source, "server"), notInArray(bannedPlayers.steamId, steamIds))
          : eq(bannedPlayers.source, "server"),
      );
  });
}
