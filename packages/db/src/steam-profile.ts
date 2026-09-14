// SteamProfile: a player's Steam Web API identity/achievement data, keyed by
// steamId alone, not scoped per-Server. See CONTEXT.md and
// docs/adr/0002-scope-steamprofile-per-account-not-per-server.md.

// The WARDOGS Steam app (https://store.steampowered.com/app/1867240/) -
// shared between apps/worker (fetching) and apps/web (filtering the cached
// achievement schema to this game).
export const WARDOGS_STEAM_APP_ID = 1867240;

export interface SteamAchievementUnlock {
  apiName: string;
  unlockedAt: string;
}

// "private": Steam reports the player's game details as private - terminal,
// never retried. "error": the fetch itself failed (network, rate limit) -
// transient, retried the next time the steamId is sighted. "ok": personaName/
// avatarUrl/achievements were fetched successfully.
export type SteamProfileStatus = "ok" | "private" | "error";
