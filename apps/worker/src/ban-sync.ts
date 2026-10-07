import { bannedPlayers, type Database } from "@wdza-stats/db";
import { and, eq, notInArray, sql } from "drizzle-orm";
import type { WarconClient } from "./warcon-client";

/**
 * Mirrors the Warcon org's ban list into banned_players as `source: "warcon"`
 * rows, so a player banned in Warcon is filtered and hidden exactly like one
 * a Staff Member banned (see schema.ts's bannedPlayers doc comment). A
 * "warcon" row Warcon no longer lists (lifted or expired) is deleted; a
 * "site" row is never touched, even when the same steamId is on both lists.
 * Throws if Warcon can't be read, leaving the last synced list in place.
 */
export async function syncWarconBans(db: Database, client: WarconClient): Promise<void> {
  const bans = await client.fetchBans();
  const steamIds = bans.map((ban) => ban.steamId);

  await db.transaction(async (tx) => {
    if (bans.length > 0) {
      await tx
        .insert(bannedPlayers)
        .values(
          bans.map((ban) => ({
            steamId: ban.steamId,
            reason: ban.reason.trim() === "" ? null : ban.reason.trim(),
            bannedAt: new Date(ban.addedAt),
            source: "warcon" as const,
          })),
        )
        .onConflictDoUpdate({
          target: bannedPlayers.steamId,
          set: { reason: sql`excluded.reason`, bannedAt: sql`excluded.banned_at` },
          setWhere: eq(bannedPlayers.source, "warcon"),
        });
    }

    await tx
      .delete(bannedPlayers)
      .where(
        steamIds.length > 0
          ? and(eq(bannedPlayers.source, "warcon"), notInArray(bannedPlayers.steamId, steamIds))
          : eq(bannedPlayers.source, "warcon"),
      );
  });
}

/** Syncs now and then every `intervalMs`, logging and swallowing failures instead of crashing the Worker. */
export function startWarconBanSync(db: Database, client: WarconClient, intervalMs: number): NodeJS.Timeout {
  const syncOnce = () =>
    syncWarconBans(db, client).catch((error) => {
      console.error("[worker] Warcon ban sync failed:", error);
    });
  void syncOnce();
  return setInterval(() => void syncOnce(), intervalMs);
}
