import { playerCareerStats, type Database } from "@wdza-stats/db";
import { and, eq, ilike } from "drizzle-orm";
import { getOnlineFactionColors } from "./live-snapshot";
import {
  toPlayerCareerView,
  type PlayerCareerView,
} from "./player-career-stats";
import { getServerByBaseUrl } from "./server-lookup";
import { getAvatarUrlsBySteamId } from "./steam-profile-lookup";

export type { PlayerCareerView } from "./player-career-stats";

/**
 * Finds players on the given Server whose display name contains `query`
 * (case-insensitive), most kills first. Returns an empty list when the
 * Server isn't seeded, or nothing matches.
 */
export async function searchPlayersByName(
  db: Database,
  baseUrl: string,
  query: string,
): Promise<PlayerCareerView[]> {
  const server = await getServerByBaseUrl(db, baseUrl);

  if (!server) {
    return [];
  }

  const rows = await db
    .select()
    .from(playerCareerStats)
    .where(
      and(
        eq(playerCareerStats.serverId, server.id),
        ilike(playerCareerStats.displayName, `%${query}%`),
      ),
    );

  const [factionColors, avatarUrls] = await Promise.all([
    getOnlineFactionColors(db, server.id),
    getAvatarUrlsBySteamId(db, rows.map((row) => row.steamId)),
  ]);

  return rows
    .map((row) => toPlayerCareerView(row, factionColors, avatarUrls))
    .sort((a, b) => b.kills - a.kills);
}

/**
 * Reads one player's all-time totals on the given Server by steamId.
 * Returns null when the Server isn't seeded, or the player has no
 * PlayerCareerStat row there.
 */
export async function getPlayerCareerStat(
  db: Database,
  baseUrl: string,
  steamId: string,
): Promise<PlayerCareerView | null> {
  const server = await getServerByBaseUrl(db, baseUrl);

  if (!server) {
    return null;
  }

  const [row] = await db
    .select()
    .from(playerCareerStats)
    .where(
      and(
        eq(playerCareerStats.serverId, server.id),
        eq(playerCareerStats.steamId, steamId),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  const [factionColors, avatarUrls] = await Promise.all([
    getOnlineFactionColors(db, server.id),
    getAvatarUrlsBySteamId(db, [steamId]),
  ]);
  return toPlayerCareerView(row, factionColors, avatarUrls);
}
