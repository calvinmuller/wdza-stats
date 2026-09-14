import type { SteamAchievementUnlock } from "@wdza-stats/db";

const STEAM_API_BASE_URL = "https://api.steampowered.com";

// GetPlayerSummaries accepts at most 100 steamids per call.
const MAX_STEAM_IDS_PER_SUMMARIES_CALL = 100;

export interface SteamPlayerSummary {
  steamId: string;
  personaName: string;
  avatarUrl: string;
}

export interface SteamAchievementSchemaEntry {
  apiName: string;
  displayName: string;
  description: string | null;
  iconUrl: string;
}

export type PlayerAchievementsResult =
  | { available: true; achievements: SteamAchievementUnlock[] }
  | { available: false };

/**
 * Thrown for any non-2xx response except GetPlayerAchievements' 400 for a
 * private profile, which is a normal `{available: false}` result, not an
 * error - see fetchPlayerAchievements. retryAfterSeconds is populated from
 * the response header when Steam sends one on a 429.
 */
export class SteamApiError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number | null;

  constructor(message: string, status: number, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "SteamApiError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface SteamClient {
  fetchPlayerSummaries(steamIds: string[]): Promise<SteamPlayerSummary[]>;
  fetchPlayerAchievements(
    steamId: string,
    appId: number,
  ): Promise<PlayerAchievementsResult>;
  fetchGameSchema(appId: number): Promise<SteamAchievementSchemaEntry[]>;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function retryAfterSecondsFrom(response: Response): number | null {
  const header = response.headers.get("Retry-After");
  if (!header) {
    return null;
  }
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds : null;
}

interface RawPlayerSummary {
  steamid: string;
  personaname: string;
  avatarfull: string;
}

interface RawPlayerAchievement {
  apiname: string;
  achieved: number;
  unlocktime: number;
}

interface RawSchemaAchievement {
  name: string;
  displayName: string;
  description?: string;
  icon: string;
}

export function createSteamClient(apiKey: string): SteamClient {
  async function get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(path, STEAM_API_BASE_URL);
    url.searchParams.set("key", apiKey);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new SteamApiError(
        `Steam API request to ${path} failed with status ${response.status}`,
        response.status,
        retryAfterSecondsFrom(response),
      );
    }
    return (await response.json()) as T;
  }

  return {
    async fetchPlayerSummaries(steamIds) {
      if (steamIds.length === 0) {
        return [];
      }

      const results: SteamPlayerSummary[] = [];
      for (const batch of chunk(steamIds, MAX_STEAM_IDS_PER_SUMMARIES_CALL)) {
        const data = await get<{ response?: { players?: RawPlayerSummary[] } }>(
          "/ISteamUser/GetPlayerSummaries/v2/",
          { steamids: batch.join(",") },
        );
        for (const player of data.response?.players ?? []) {
          results.push({
            steamId: player.steamid,
            personaName: player.personaname,
            avatarUrl: player.avatarfull,
          });
        }
      }
      return results;
    },

    async fetchPlayerAchievements(steamId, appId) {
      const url = new URL("/ISteamUserStats/GetPlayerAchievements/v1/", STEAM_API_BASE_URL);
      url.searchParams.set("key", apiKey);
      url.searchParams.set("steamid", steamId);
      url.searchParams.set("appid", String(appId));

      const response = await fetch(url);

      // 429/5xx never carry a parseable playerstats body - genuine
      // transient failures, fail fast without attempting to parse.
      if (response.status === 429 || response.status >= 500) {
        throw new SteamApiError(
          `GetPlayerAchievements failed with status ${response.status}`,
          response.status,
          retryAfterSecondsFrom(response),
        );
      }

      // Steam answers a private profile (or a player who has never
      // launched the game) with a non-2xx status - 403 with
      // {"error":"Profile is not public"} observed in practice, despite
      // the API reference implying 400 - and {success: false} in the body.
      // Not a genuine failure, so any other status is parsed the same way
      // a 200 would be, rather than assuming a specific non-2xx code.
      let data: { playerstats?: { success: boolean; achievements?: RawPlayerAchievement[] } };
      try {
        data = await response.json();
      } catch {
        throw new SteamApiError(
          `GetPlayerAchievements returned an unparseable response (status ${response.status})`,
          response.status,
          null,
        );
      }

      if (!data.playerstats?.success) {
        return { available: false };
      }

      const achievements: SteamAchievementUnlock[] = (data.playerstats.achievements ?? [])
        .filter((achievement) => achievement.achieved === 1)
        .map((achievement) => ({
          apiName: achievement.apiname,
          unlockedAt: new Date(achievement.unlocktime * 1000).toISOString(),
        }));

      return { available: true, achievements };
    },

    async fetchGameSchema(appId) {
      const data = await get<{
        game?: { availableGameStats?: { achievements?: RawSchemaAchievement[] } };
      }>("/ISteamUserStats/GetSchemaForGame/v2/", { appid: String(appId) });

      return (data.game?.availableGameStats?.achievements ?? []).map((achievement) => ({
        apiName: achievement.name,
        displayName: achievement.displayName,
        description: achievement.description ?? null,
        iconUrl: achievement.icon,
      }));
    },
  };
}
