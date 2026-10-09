import { kills, servers, type Database } from "@wdza-stats/db";
import { and, eq, inArray } from "drizzle-orm";
import { getBannedSteamIds } from "./banned-players";
import type { KillScope } from "./kill-scope";
import { weaponStatsWhere, type ServerWeaponStat } from "./server-kill-stats";
import { countingWeaponKills, killsInScope } from "./weapon-leaderboard";

// The home page's most-used weapons across every enabled Server. Counted the
// way the weapon leaderboard counts a Kill, so roadkills and vehicle
// explosions don't count, and from the kill feed alone - see Kill in
// CONTEXT.md.

export const TOP_WEAPONS_SIZE = 5;

/**
 * The most-used weapons in the scope across every enabled Server, most Kills
 * first, ties by cause tag, the top TOP_WEAPONS_SIZE only.
 */
export async function getTopWeapons(db: Database, scope: KillScope): Promise<ServerWeaponStat[]> {
  const bannedSteamIds = await getBannedSteamIds(db);
  const enabledServers = db.select({ id: servers.id }).from(servers).where(eq(servers.enabled, true));
  return weaponStatsWhere(
    db,
    [inArray(kills.serverId, enabledServers), ...countingWeaponKills(bannedSteamIds), ...killsInScope(scope)],
    TOP_WEAPONS_SIZE,
  );
}
