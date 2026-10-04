import {
  achievementDefinitions,
  challengeCompletions,
  challengeDefinitions,
  challengeInstances,
  dailyPeriodKey,
  levelProgressForXp,
  levelThresholds,
  playerAchievements,
  playerCareerStats,
  playerChallengeProgress,
  playerSeasonStats,
  type ChallengeType,
  type Database,
} from "@wdza-stats/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { describeChallenge } from "./active-challenges";
import { getBannedSteamIds } from "./banned-players";
import { kdRatio } from "./player-career-stats";
import type { SeasonScope } from "./season-param";
import { playedInSeason } from "./season-stats";
import { getServerByBaseUrl } from "./server-lookup";
import { getOnlineFactionColors } from "./live-snapshot";
import { getSteamProfile, type SteamAchievementView } from "./steam-profile-lookup";

export interface PlayerProgressionView {
  steamId: string;
  displayName: string;
  personaName: string | null;
  avatarUrl: string | null;
  countryCode: string | null;
  factionColor: string | null;
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpRequiredForNextLevel: number | null;
  progressPercent: number;
}

export interface PlayerStatsView {
  steamId: string;
  kills: number;
  deaths: number;
  kd: number;
  cash: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  highestKillStreak: number;
  currentKillStreak: number;
  mvpCount: number;
}

export interface PlayerAchievementView {
  id: string;
  name: string;
  description: string;
  unlockedAt: string;
}

export interface PlayerChallengeProgressView {
  instanceId: number;
  type: ChallengeType;
  description: string;
  target: number;
  progress: number;
  xpReward: number;
  completed: boolean;
}

// Shared existence check every endpoint/view in this module gates on: a
// steamId only has a progression/stats view once it has a PlayerCareerStat
// row on this Server (created the first time the Worker sees them in a
// closed Match - see match-tracker.ts). Unlike achievements/challenges
// (which are naturally empty lists for such a player), progression/stats
// have no sensible shape to return for a steamId nobody has ever seen, so
// those two views
// stay null/404 for that case - same "not found" behavior the player page
// already had before this ticket.
async function getPlayerCareerRow(db: Database, baseUrl: string, steamId: string) {
  const server = await getServerByBaseUrl(db, baseUrl);

  if (!server) {
    return null;
  }

  const bannedSteamIds = await getBannedSteamIds(db);
  if (bannedSteamIds.includes(steamId)) {
    return null;
  }

  const [row] = await db
    .select()
    .from(playerCareerStats)
    .where(
      and(eq(playerCareerStats.serverId, server.id), eq(playerCareerStats.steamId, steamId)),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return { server, row };
}

/**
 * A player's identity plus their level/XP/progress-to-next-level on the
 * given Server - the `GET /api/players/:steamId` payload. Level and progress
 * are always derived fresh from `xp` via levelProgressForXp (the
 * Progression Engine's own source of truth - see level.ts) rather than
 * trusting playerCareerStats.level's cached copy directly. Returns null when
 * the Server isn't seeded, or this steamId has no PlayerCareerStat row there
 * yet (never seen in a closed Match).
 */
export async function getPlayerProgression(
  db: Database,
  baseUrl: string,
  steamId: string,
): Promise<PlayerProgressionView | null> {
  const found = await getPlayerCareerRow(db, baseUrl, steamId);

  if (!found) {
    return null;
  }

  const { server, row } = found;

  const [thresholds, factionColors, steamProfile] = await Promise.all([
    db.select().from(levelThresholds),
    getOnlineFactionColors(db, server.id),
    getSteamProfile(db, steamId),
  ]);

  const progress = levelProgressForXp(row.xp, thresholds);

  return {
    steamId: row.steamId,
    displayName: row.displayName,
    personaName: steamProfile?.personaName ?? null,
    avatarUrl: steamProfile?.avatarUrl ?? null,
    countryCode: steamProfile?.countryCode ?? null,
    factionColor: factionColors.get(row.steamId) ?? null,
    level: progress.level,
    xp: row.xp,
    xpIntoLevel: progress.xpIntoLevel,
    xpRequiredForNextLevel: progress.xpRequiredForNextLevel,
    progressPercent: progress.progressPercent,
  };
}

/**
 * A player's lifetime stats on the given Server - the
 * `GET /api/players/:steamId/stats` payload. Returns null under the same
 * conditions as getPlayerProgression.
 */
export async function getPlayerStats(
  db: Database,
  baseUrl: string,
  steamId: string,
): Promise<PlayerStatsView | null> {
  const found = await getPlayerCareerRow(db, baseUrl, steamId);

  if (!found) {
    return null;
  }

  const { row } = found;

  return toStatsView(row, row.currentKillStreak);
}

// The PlayerStatsView of a PlayerCareerStat or PlayerSeasonStat row, which
// share every stat column. currentKillStreak is passed separately: it's live
// Match state, kept only on the career row.
function toStatsView(
  row: Omit<typeof playerSeasonStats.$inferSelect, "seasonId" | "serverId" | "xp">,
  currentKillStreak: number,
): PlayerStatsView {
  return {
    steamId: row.steamId,
    kills: row.kills,
    deaths: row.deaths,
    kd: kdRatio(row.kills, row.deaths),
    cash: row.cash,
    matchesPlayed: row.matchesPlayed,
    matchesWon: row.matchesWon,
    matchesLost: row.matchesLost,
    highestKillStreak: row.highestKillStreak,
    currentKillStreak,
    mvpCount: row.mvpCount,
  };
}

/**
 * A known player's stats for a SeasonScope. `stats` is null only for a
 * Season the player played no Match in.
 */
export interface PlayerStatsInScope {
  stats: PlayerStatsView | null;
}

/**
 * A player's stats for a SeasonScope: Career (exactly getPlayerStats), or
 * their totals for one Season. Returns null when there is no such player
 * (same conditions as getPlayerStats), and `{ stats: null }` for a player
 * who played no Match in the Season - they still exist, they just have no
 * Season stats to show. currentKillStreak is always the live KillStreak in
 * the player's open Match, whatever the scope.
 */
export async function getPlayerStatsInScope(
  db: Database,
  baseUrl: string,
  steamId: string,
  scope: SeasonScope,
): Promise<PlayerStatsInScope | null> {
  if (scope.kind === "career") {
    const stats = await getPlayerStats(db, baseUrl, steamId);
    return stats && { stats };
  }

  const found = await getPlayerCareerRow(db, baseUrl, steamId);

  if (!found) {
    return null;
  }

  const { server, row: careerRow } = found;

  const [row] = await db
    .select()
    .from(playerSeasonStats)
    .where(
      and(playedInSeason(scope.season.id, server.id), eq(playerSeasonStats.steamId, steamId)),
    )
    .limit(1);

  return { stats: row ? toStatsView(row, careerRow.currentKillStreak) : null };
}

/**
 * A player's unlocked Achievements on the given Server, most recently
 * unlocked first - the `GET /api/players/:steamId/achievements` payload.
 * Unlike getPlayerProgression/getPlayerStats, this returns an empty list (never
 * null) both when the Server isn't seeded and when the player simply hasn't
 * unlocked anything yet - "no gamification activity" is a legitimate, non-
 * error state for a list endpoint, matching getRecentMatches/
 * getActiveChallenges' own empty-list precedent.
 */
export async function getPlayerAchievements(
  db: Database,
  baseUrl: string,
  steamId: string,
): Promise<PlayerAchievementView[]> {
  const server = await getServerByBaseUrl(db, baseUrl);

  if (!server) {
    return [];
  }

  const rows = await db
    .select({
      id: achievementDefinitions.id,
      name: achievementDefinitions.name,
      description: achievementDefinitions.description,
      unlockedAt: playerAchievements.unlockedAt,
    })
    .from(playerAchievements)
    .innerJoin(
      achievementDefinitions,
      eq(achievementDefinitions.id, playerAchievements.achievementId),
    )
    .where(
      and(eq(playerAchievements.serverId, server.id), eq(playerAchievements.steamId, steamId)),
    )
    .orderBy(desc(playerAchievements.unlockedAt));

  return rows.map((row) => ({ ...row, unlockedAt: row.unlockedAt.toISOString() }));
}

/**
 * One player's progress toward each of the Server's currently active daily
 * ChallengeInstances (today's UTC period, per `dailyPeriodKey`) - the
 * `GET /api/players/:steamId/challenges` payload. `asOf` should be the
 * Snapshot's own capturedAt where one is available, mirroring
 * getActiveChallenges - defaults to the current time for a plain API
 * request with no Snapshot context. Mirrors getActiveChallenges' overall
 * per-instance view but scoped to one player's own progress/completion
 * instead of every player's aggregate counts. Returns an empty list (never
 * null) whenever the Server isn't seeded, no Challenges are active today, or
 * (for a player with no gamification activity) simply reports 0 progress
 * against every active instance rather than omitting them.
 */
export async function getPlayerChallengeProgress(
  db: Database,
  baseUrl: string,
  steamId: string,
  asOf: Date = new Date(),
): Promise<PlayerChallengeProgressView[]> {
  const server = await getServerByBaseUrl(db, baseUrl);

  if (!server) {
    return [];
  }

  const periodKey = dailyPeriodKey(asOf);

  const instances = await db
    .select({
      instanceId: challengeInstances.id,
      type: challengeDefinitions.type,
      target: challengeDefinitions.target,
      xpReward: challengeDefinitions.xpReward,
    })
    .from(challengeInstances)
    .innerJoin(challengeDefinitions, eq(challengeInstances.definitionId, challengeDefinitions.id))
    .where(
      and(eq(challengeInstances.serverId, server.id), eq(challengeInstances.periodKey, periodKey)),
    );

  if (instances.length === 0) {
    return [];
  }

  const instanceIds = instances.map((instance) => instance.instanceId);

  const [progressRows, completionRows] = await Promise.all([
    db
      .select({
        instanceId: playerChallengeProgress.instanceId,
        progress: playerChallengeProgress.progress,
      })
      .from(playerChallengeProgress)
      .where(
        and(
          inArray(playerChallengeProgress.instanceId, instanceIds),
          eq(playerChallengeProgress.steamId, steamId),
        ),
      ),
    db
      .select({ instanceId: challengeCompletions.instanceId })
      .from(challengeCompletions)
      .where(
        and(
          inArray(challengeCompletions.instanceId, instanceIds),
          eq(challengeCompletions.steamId, steamId),
        ),
      ),
  ]);

  const progressByInstance = new Map(
    progressRows.map((row) => [row.instanceId, row.progress]),
  );
  const completedInstances = new Set(completionRows.map((row) => row.instanceId));

  return instances.map((instance) => ({
    instanceId: instance.instanceId,
    type: instance.type,
    description: describeChallenge(instance.type, instance.target),
    target: instance.target,
    progress: progressByInstance.get(instance.instanceId) ?? 0,
    xpReward: instance.xpReward,
    completed: completedInstances.has(instance.instanceId),
  }));
}

// How many steamIds one bulk request may ask for - each one costs a handful
// of queries, so the list is capped rather than left open-ended.
export const MAX_BULK_STEAM_IDS = 50;

export interface PlayerDetailView {
  steamId: string;
  progression: PlayerProgressionView;
  // Never null for Career; null for a Season the player played no Match in.
  stats: PlayerStatsView | null;
  achievements: PlayerAchievementView[];
  challenges: PlayerChallengeProgressView[];
  steamAchievements: SteamAchievementView[];
  playtimeMinutes: number | null;
}

/**
 * Parses a comma-separated steamId list (the `?steamIds=` query param):
 * trimmed, blanks dropped, duplicates removed, request order kept.
 */
export function parseSteamIdList(raw: string | null): string[] {
  if (!raw) {
    return [];
  }
  return Array.from(
    new Set(raw.split(",").map((steamId) => steamId.trim()).filter(Boolean)),
  );
}

/**
 * Everything the single-player endpoints return, for many players at once -
 * the `GET /api/players?steamIds=` payload. Composes the same per-player
 * functions, so each player gets exactly what their own endpoints would
 * show; `scope` picks Career or one Season's stats, and everything else is
 * career-long whatever the scope. A steamId with no progression (never seen
 * on this Server, or banned) is listed in `notFound` instead of `players`.
 */
export async function getPlayerDetails(
  db: Database,
  baseUrl: string,
  steamIds: string[],
  scope: SeasonScope,
): Promise<{ players: PlayerDetailView[]; notFound: string[] }> {
  const results = await Promise.all(
    steamIds.map(async (steamId): Promise<PlayerDetailView | null> => {
      const [progression, scoped, achievements, challenges, steamProfile] = await Promise.all([
        getPlayerProgression(db, baseUrl, steamId),
        getPlayerStatsInScope(db, baseUrl, steamId, scope),
        getPlayerAchievements(db, baseUrl, steamId),
        getPlayerChallengeProgress(db, baseUrl, steamId),
        getSteamProfile(db, steamId),
      ]);

      if (!progression || !scoped) {
        return null;
      }

      return {
        steamId,
        progression,
        stats: scoped.stats,
        achievements,
        challenges,
        steamAchievements: steamProfile?.achievements ?? [],
        playtimeMinutes: steamProfile?.playtimeMinutes ?? null,
      };
    }),
  );

  return {
    players: results.filter((player): player is PlayerDetailView => player !== null),
    notFound: steamIds.filter((_, index) => results[index] === null),
  };
}
