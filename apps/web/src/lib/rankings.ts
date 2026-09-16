import { playerCareerStats, steamProfiles, type Database } from "@wdza-stats/db";
import { and, asc, count, desc, eq, notInArray } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { getBannedSteamIds } from "./banned-players";
import { getServerByBaseUrl } from "./server-lookup";

export type RankingMetric = "xp" | "kills" | "wins" | "streaks";

export const RANKING_METRICS: RankingMetric[] = ["xp", "kills", "wins", "streaks"];

export const RANKINGS_PAGE_SIZE = 25;

export type RankingRow = {
  rank: number;
  steamId: string;
  displayName: string;
  avatarUrl: string | null;
  countryCode: string | null;
  value: number;
};

export type RankingsResult = {
  metric: RankingMetric;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  rows: RankingRow[];
};

export function isRankingMetric(value: string): value is RankingMetric {
  return (RANKING_METRICS as string[]).includes(value);
}

export function parseRankingsPage(value: string | null | undefined): number {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

// The same "rank players by one of a few numeric metrics" problem as
// leaderboard.ts's SORT_VALUE, mapped to the equivalent playerCareerStats
// column instead of a JS accessor, since these ranks are computed in SQL.
const METRIC_COLUMNS: Record<RankingMetric, PgColumn> = {
  xp: playerCareerStats.xp,
  kills: playerCareerStats.kills,
  wins: playerCareerStats.matchesWon,
  streaks: playerCareerStats.highestKillStreak,
};

function emptyPage(metric: RankingMetric, page: number): RankingsResult {
  return {
    metric,
    page,
    pageSize: RANKINGS_PAGE_SIZE,
    totalCount: 0,
    totalPages: 0,
    rows: [],
  };
}

/**
 * Ranks every player with a PlayerCareerStat on the given Server by one
 * gamification metric (xp, kills, wins, or best kill streak), highest
 * first. Rank and pagination are both computed here, server-side - the
 * frontend only ever renders what this returns.
 */
export async function getRankings(
  db: Database,
  baseUrl: string,
  metric: RankingMetric,
  page: number,
): Promise<RankingsResult> {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const server = await getServerByBaseUrl(db, baseUrl);

  if (!server) {
    return emptyPage(metric, safePage);
  }

  const bannedSteamIds = await getBannedSteamIds(db);
  const notBanned = notInArray(playerCareerStats.steamId, bannedSteamIds);

  const [{ value: totalCount }] = await db
    .select({ value: count() })
    .from(playerCareerStats)
    .where(and(eq(playerCareerStats.serverId, server.id), notBanned));

  if (totalCount === 0) {
    return emptyPage(metric, safePage);
  }

  const column = METRIC_COLUMNS[metric];
  const offset = (safePage - 1) * RANKINGS_PAGE_SIZE;

  const statRows = await db
    .select({
      steamId: playerCareerStats.steamId,
      displayName: playerCareerStats.displayName,
      avatarUrl: steamProfiles.avatarUrl,
      countryCode: steamProfiles.countryCode,
      value: column,
    })
    .from(playerCareerStats)
    // A player without a cached SteamProfile still needs to appear in the
    // rankings - a leftJoin keeps them in with null avatar/country rather
    // than dropping the row.
    .leftJoin(steamProfiles, eq(steamProfiles.steamId, playerCareerStats.steamId))
    .where(and(eq(playerCareerStats.serverId, server.id), notBanned))
    // steamId as a tiebreaker keeps ranking (and pagination) stable when
    // multiple players share the same metric value.
    .orderBy(desc(column), asc(playerCareerStats.steamId))
    .limit(RANKINGS_PAGE_SIZE)
    .offset(offset);

  const rows: RankingRow[] = statRows.map((row, index) => ({
    rank: offset + index + 1,
    steamId: row.steamId,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    countryCode: row.countryCode,
    value: Number(row.value),
  }));

  return {
    metric,
    page: safePage,
    pageSize: RANKINGS_PAGE_SIZE,
    totalCount,
    totalPages: Math.ceil(totalCount / RANKINGS_PAGE_SIZE),
    rows,
  };
}
