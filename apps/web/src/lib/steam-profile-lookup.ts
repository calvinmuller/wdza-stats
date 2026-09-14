import {
  steamAchievementSchema,
  steamProfiles,
  WARDOGS_STEAM_APP_ID,
  type Database,
} from "@wdza-stats/db";
import { eq } from "drizzle-orm";

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
  };
}
