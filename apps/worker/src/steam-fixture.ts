import type {
  PlayerAchievementsResult,
  SteamAchievementSchemaEntry,
  SteamClient,
  SteamPlayerSummary,
} from "./steam-client";

// Test-only seam: a fake SteamClient backed by in-memory maps, so
// steam-profile-refresh.ts can be exercised for real without hitting the
// network. Call counts are exposed for assertions.
export function scriptedSteamClient(options: {
  summaries?: Record<string, SteamPlayerSummary>;
  achievements?: Record<string, PlayerAchievementsResult>;
  schema?: SteamAchievementSchemaEntry[];
  playtimeMinutes?: Record<string, number>;
  failSummaries?: (steamIds: string[]) => Error | null;
  failAchievements?: (steamId: string) => Error | null;
  failPlaytime?: (steamId: string) => Error | null;
}): SteamClient & {
  summariesCalls: string[][];
  achievementsCalls: string[];
  playtimeCalls: string[];
} {
  const summariesCalls: string[][] = [];
  const achievementsCalls: string[] = [];
  const playtimeCalls: string[] = [];

  return {
    summariesCalls,
    achievementsCalls,
    playtimeCalls,
    async fetchPlayerSummaries(steamIds) {
      summariesCalls.push(steamIds);
      const failure = options.failSummaries?.(steamIds);
      if (failure) {
        throw failure;
      }
      return steamIds
        .map((steamId) => options.summaries?.[steamId])
        .filter((summary): summary is SteamPlayerSummary => summary !== undefined);
    },
    async fetchPlayerAchievements(steamId) {
      achievementsCalls.push(steamId);
      const failure = options.failAchievements?.(steamId);
      if (failure) {
        throw failure;
      }
      return options.achievements?.[steamId] ?? { available: false };
    },
    async fetchGameSchema() {
      return options.schema ?? [];
    },
    async fetchPlayerPlaytimeMinutes(steamId) {
      playtimeCalls.push(steamId);
      const failure = options.failPlaytime?.(steamId);
      if (failure) {
        throw failure;
      }
      return options.playtimeMinutes?.[steamId] ?? null;
    },
  };
}
