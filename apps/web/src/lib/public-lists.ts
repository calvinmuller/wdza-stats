import {
  bannedPlayers,
  playerCareerStats,
  reservedSlots,
  servers,
  steamProfiles,
  type Database,
} from "@wdza-stats/db";
import { and, desc, eq, inArray } from "drizzle-orm";

// The two public moderation lists, /bans and /whitelist: every BannedPlayer
// (site and Warcon alike) and every ReservedSlot. Both are keyed by steamId
// alone, so neither is scoped to a Server. Fields are picked explicitly, like
// /api/bans, so a column later added for staff eyes only never leaks here.

/** Who a steamId on a public list is, as far as this site knows. */
export interface PublicListPlayer {
  steamId: string;
  /** The Steam persona, else the name Warcon last saw, else a name from the stats, else null. */
  name: string | null;
  avatarUrl: string | null;
  countryCode: string | null;
  /** Whether the player has a PlayerCareerStat on an enabled Server, i.e. a /players/{steamId} page. */
  hasStats: boolean;
}

export interface PublicBan extends PublicListPlayer {
  reason: string | null;
  bannedAt: Date;
}

export interface PublicReservedSlot extends PublicListPlayer {
  addedAt: Date;
}

/** A name for each of `steamIds` that has a PlayerCareerStat on an enabled Server. */
async function careerNames(db: Database, steamIds: string[]): Promise<Map<string, string>> {
  if (steamIds.length === 0) return new Map();

  const rows = await db
    .select({ steamId: playerCareerStats.steamId, displayName: playerCareerStats.displayName })
    .from(playerCareerStats)
    .innerJoin(servers, and(eq(servers.id, playerCareerStats.serverId), eq(servers.enabled, true)))
    .where(inArray(playerCareerStats.steamId, steamIds))
    // Most career XP first, so the Server a player plays most names them.
    .orderBy(desc(playerCareerStats.xp), playerCareerStats.serverId);

  const names = new Map<string, string>();
  for (const row of rows) if (!names.has(row.steamId)) names.set(row.steamId, row.displayName);
  return names;
}

/** Every banned player, most recently banned first. */
export async function listPublicBans(db: Database): Promise<PublicBan[]> {
  const rows = await db
    .select({
      steamId: bannedPlayers.steamId,
      reason: bannedPlayers.reason,
      bannedAt: bannedPlayers.bannedAt,
      personaName: steamProfiles.personaName,
      avatarUrl: steamProfiles.avatarUrl,
      countryCode: steamProfiles.countryCode,
    })
    .from(bannedPlayers)
    .leftJoin(steamProfiles, eq(steamProfiles.steamId, bannedPlayers.steamId))
    .orderBy(desc(bannedPlayers.bannedAt), bannedPlayers.steamId);
  const names = await careerNames(db, rows.map((row) => row.steamId));

  return rows.map(({ personaName, ...row }) => ({
    ...row,
    name: personaName ?? names.get(row.steamId) ?? null,
    // A banned player's own pages are hidden, whatever stats they have.
    hasStats: false,
  }));
}

/** Every player with a reserved slot, by name, nameless ones last. */
export async function listPublicReservedSlots(db: Database): Promise<PublicReservedSlot[]> {
  const rows = await db
    .select({
      steamId: reservedSlots.steamId,
      warconName: reservedSlots.name,
      addedAt: reservedSlots.addedAt,
      personaName: steamProfiles.personaName,
      avatarUrl: steamProfiles.avatarUrl,
      countryCode: steamProfiles.countryCode,
    })
    .from(reservedSlots)
    .leftJoin(steamProfiles, eq(steamProfiles.steamId, reservedSlots.steamId));
  const names = await careerNames(db, rows.map((row) => row.steamId));

  const slots = rows.map(({ personaName, warconName, ...row }) => ({
    ...row,
    name: personaName ?? warconName ?? names.get(row.steamId) ?? null,
    hasStats: names.has(row.steamId),
  }));
  return slots.sort((a, b) => {
    if (a.name === null || b.name === null) return a.name === b.name ? 0 : a.name === null ? 1 : -1;
    return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  });
}
