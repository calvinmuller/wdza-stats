import {
  steamAchievementSchema,
  steamProfiles,
  WARDOGS_STEAM_APP_ID,
  type Database,
} from "@wdza-stats/db";
import { eq, inArray } from "drizzle-orm";

export interface SteamAchievementView {
  apiName: string;
  displayName: string;
  description: string | null;
  iconUrl: string;
  unlockedAt: string;
}

export interface SteamProfileView {
  steamId: string;
  personaName: string | null;
  avatarUrl: string | null;
  achievements: SteamAchievementView[];
  playtimeMinutes: number | null;
}

/**
 * Reads one player's cached SteamProfile, resolving each unlocked
 * achievement's name/description/icon against the cached WARDOGS
 * achievement schema. Returns null when nothing has been fetched for this
 * steamId yet.
 *
 * personaName/avatarUrl can be present even when achievements aren't (a
 * "private" row still has identity data - see apps/worker's
 * steam-profile-refresh.ts) - achievements comes back empty for any status
 * other than "ok", never an error. Callers render nothing for a section
 * with no data.
 */
export async function getSteamProfile(
  db: Database,
  steamId: string,
): Promise<SteamProfileView | null> {
  const [row] = await db
    .select()
    .from(steamProfiles)
    .where(eq(steamProfiles.steamId, steamId))
    .limit(1);

  if (!row) {
    return null;
  }

  if (row.status !== "ok" || row.achievements.length === 0) {
    return {
      steamId: row.steamId,
      personaName: row.personaName,
      avatarUrl: row.avatarUrl,
      achievements: [],
      playtimeMinutes: row.playtimeMinutes,
    };
  }

  const schemaRows = await db
    .select()
    .from(steamAchievementSchema)
    .where(eq(steamAchievementSchema.appId, WARDOGS_STEAM_APP_ID));
  const schemaByApiName = new Map(schemaRows.map((entry) => [entry.apiName, entry]));

  const achievements: SteamAchievementView[] = row.achievements.flatMap((unlock) => {
    const schema = schemaByApiName.get(unlock.apiName);
    // A schema-less unlock (schema not cached yet, or a stale apiName) is
    // dropped rather than shown with placeholder text.
    if (!schema) {
      return [];
    }
    return [
      {
        apiName: unlock.apiName,
        displayName: schema.displayName,
        description: schema.description,
        iconUrl: schema.iconUrl,
        unlockedAt: unlock.unlockedAt,
      },
    ];
  });

  return {
    steamId: row.steamId,
    personaName: row.personaName,
    avatarUrl: row.avatarUrl,
    achievements,
    playtimeMinutes: row.playtimeMinutes,
  };
}

/**
 * Batched avatar lookup for a list of players (a leaderboard, a match
 * roster, a search result page) - one query for the whole list rather than
 * one per row, mirroring live-snapshot.ts's getOnlineFactionColors. Omits
 * any steamId with no cached SteamProfile or a null avatarUrl, so callers
 * treat a missing map entry the same as "no avatar yet".
 */
export async function getAvatarUrlsBySteamId(
  db: Database,
  steamIds: string[],
): Promise<Map<string, string>> {
  if (steamIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({ steamId: steamProfiles.steamId, avatarUrl: steamProfiles.avatarUrl })
    .from(steamProfiles)
    .where(inArray(steamProfiles.steamId, Array.from(new Set(steamIds))));

  const avatarUrls = new Map<string, string>();
  for (const row of rows) {
    if (row.avatarUrl) {
      avatarUrls.set(row.steamId, row.avatarUrl);
    }
  }
  return avatarUrls;
}

/**
 * Batched WARDOGS playtime lookup for a list of players, mirroring
 * getAvatarUrlsBySteamId above. Omits any steamId with no cached
 * SteamProfile or a null playtimeMinutes (never fetched, or the player's
 * game details are private) - callers treat a missing map entry as
 * "unknown", not "zero".
 */
export async function getPlaytimeMinutesBySteamId(
  db: Database,
  steamIds: string[],
): Promise<Map<string, number>> {
  if (steamIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({ steamId: steamProfiles.steamId, playtimeMinutes: steamProfiles.playtimeMinutes })
    .from(steamProfiles)
    .where(inArray(steamProfiles.steamId, Array.from(new Set(steamIds))));

  const playtimeMinutes = new Map<string, number>();
  for (const row of rows) {
    if (row.playtimeMinutes !== null) {
      playtimeMinutes.set(row.steamId, row.playtimeMinutes);
    }
  }
  return playtimeMinutes;
}
