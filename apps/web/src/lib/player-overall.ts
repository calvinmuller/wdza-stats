import {
  levelForXp,
  levelProgressForXp,
  levelThresholds,
  playerCareerStats,
  playerSeasonStats,
  servers,
  steamProfiles,
  type Database,
  type LevelProgress,
} from "@wdza-stats/db";
import { and, asc, desc, eq, getTableColumns, gt, inArray } from "drizzle-orm";
import { getBannedSteamIds } from "./banned-players";
import { kdRatio } from "./player-career-stats";
import type { SeasonScope } from "./season-param";

// PlayerOverallStat (see CONTEXT.md): a player's totals summed across every
// enabled Server, computed on read. Its overall level comes from career XP
// summed the same way, on the one level curve every Server shares.

/** Who a player is across every enabled Server, and their overall level. */
export interface OverallIdentity {
  steamId: string;
  /** Their in-game name on the Server where they have the most career XP. */
  displayName: string;
  avatarUrl: string | null;
  countryCode: string | null;
  careerXp: number;
  level: number;
  progress: LevelProgress;
}

/**
 * The OverallIdentity of each of `steamIds` that has a PlayerCareerStat on
 * an enabled Server; the others are missing from the map.
 */
export async function getOverallIdentities(db: Database, steamIds: string[]): Promise<Map<string, OverallIdentity>> {
  if (steamIds.length === 0) return new Map();

  const [careerRows, thresholds] = await Promise.all([
    db
      .select({
        steamId: playerCareerStats.steamId,
        displayName: playerCareerStats.displayName,
        xp: playerCareerStats.xp,
        avatarUrl: steamProfiles.avatarUrl,
        countryCode: steamProfiles.countryCode,
      })
      .from(playerCareerStats)
      .innerJoin(servers, and(eq(servers.id, playerCareerStats.serverId), eq(servers.enabled, true)))
      .leftJoin(steamProfiles, eq(steamProfiles.steamId, playerCareerStats.steamId))
      .where(inArray(playerCareerStats.steamId, steamIds))
      // Most career XP first, so a player's first row names them.
      .orderBy(desc(playerCareerStats.xp), playerCareerStats.serverId),
    db.select().from(levelThresholds),
  ]);

  const careerXp = new Map<string, number>();
  for (const row of careerRows) careerXp.set(row.steamId, (careerXp.get(row.steamId) ?? 0) + row.xp);

  const identities = new Map<string, OverallIdentity>();
  for (const row of careerRows) {
    if (identities.has(row.steamId)) continue;
    const xp = careerXp.get(row.steamId)!;
    const progress = levelProgressForXp(xp, thresholds);
    identities.set(row.steamId, {
      steamId: row.steamId,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      countryCode: row.countryCode,
      careerXp: xp,
      level: progress.level,
      progress,
    });
  }
  return identities;
}

/** A player's PlayerOverallStat totals in one scope. */
export interface OverallTotals {
  xp: number;
  kills: number;
  deaths: number;
  kd: number;
  cash: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  /** The best of any one Server's: a KillStreak never spans two Servers. */
  highestKillStreak: number;
  mvpCount: number;
}

/** One enabled Server's share of a player's PlayerOverallStat. */
export interface OverallServerRow {
  slug: string;
  name: string;
  /** The player's level on this Server alone, from its career XP. */
  level: number;
  xp: number;
  kills: number;
  deaths: number;
  kd: number;
  matchesPlayed: number;
  matchesWon: number;
}

export interface PlayerOverallView {
  identity: OverallIdentity;
  /** Null when the scope is a Season the player played no Match in. */
  totals: OverallTotals | null;
  /** Each enabled Server the player played on in the scope, in the order they were added. */
  servers: OverallServerRow[];
}

/**
 * A player's PlayerOverallStat in the scope, with each Server's share. Null
 * for a banned player, or one with no PlayerCareerStat on an enabled Server.
 */
export async function getPlayerOverall(
  db: Database,
  steamId: string,
  scope: SeasonScope,
): Promise<PlayerOverallView | null> {
  const bannedSteamIds = await getBannedSteamIds(db);
  if (bannedSteamIds.includes(steamId)) return null;

  const [identities, careerRows, thresholds] = await Promise.all([
    getOverallIdentities(db, [steamId]),
    db
      .select({ slug: servers.slug, name: servers.name, ...getTableColumns(playerCareerStats) })
      .from(playerCareerStats)
      .innerJoin(servers, and(eq(servers.id, playerCareerStats.serverId), eq(servers.enabled, true)))
      .where(eq(playerCareerStats.steamId, steamId))
      .orderBy(asc(servers.id)),
    db.select().from(levelThresholds),
  ]);
  const identity = identities.get(steamId);
  if (!identity) return null;

  const seasonRows =
    scope.kind === "career"
      ? null
      : await db
          .select()
          .from(playerSeasonStats)
          .where(
            and(
              eq(playerSeasonStats.seasonId, scope.season.id),
              eq(playerSeasonStats.steamId, steamId),
              gt(playerSeasonStats.matchesPlayed, 0),
            ),
          );

  // Each Server's rows in the scope, beside the career row its level comes from.
  const scoped = careerRows.flatMap((career): { career: typeof career; stats: ScopedStats }[] => {
    if (!seasonRows) return [{ career, stats: career }];
    const stats = seasonRows.find((row) => row.serverId === career.serverId);
    return stats ? [{ career, stats }] : [];
  });

  return {
    identity,
    totals: scoped.length === 0 ? null : sumTotals(scoped.map(({ stats }) => stats)),
    servers: scoped.map(({ career, stats }) => ({
      slug: career.slug,
      name: career.name,
      level: levelForXp(career.xp, thresholds),
      xp: stats.xp,
      kills: stats.kills,
      deaths: stats.deaths,
      kd: kdRatio(stats.kills, stats.deaths),
      matchesPlayed: stats.matchesPlayed,
      matchesWon: stats.matchesWon,
    })),
  };
}

type ScopedStats = Omit<OverallTotals, "kd">;

function sumTotals(rows: ScopedStats[]): OverallTotals {
  const total = (pick: (row: ScopedStats) => number) => rows.reduce((sum, row) => sum + pick(row), 0);
  const kills = total((row) => row.kills);
  const deaths = total((row) => row.deaths);
  return {
    xp: total((row) => row.xp),
    kills,
    deaths,
    kd: kdRatio(kills, deaths),
    cash: total((row) => row.cash),
    matchesPlayed: total((row) => row.matchesPlayed),
    matchesWon: total((row) => row.matchesWon),
    matchesLost: total((row) => row.matchesLost),
    highestKillStreak: Math.max(...rows.map((row) => row.highestKillStreak)),
    mvpCount: total((row) => row.mvpCount),
  };
}
