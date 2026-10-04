import {
  levelForXp,
  levelThresholds,
  playerCareerStats,
  playerSeasonStats,
  steamProfiles,
  type Database,
} from "@wdza-stats/db";
import { and, asc, count, desc, eq, gt, notInArray } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { getBannedSteamIds } from "./banned-players";
import type { SeasonScope } from "./season-param";
import { getServerByBaseUrl } from "./server-lookup";

export type RankingMetric = "xp" | "kills" | "wins" | "streaks";

export const RANKING_METRICS: RankingMetric[] = [
  "xp",
  "kills",
  "wins",
  "streaks",
];

export const RANKINGS_PAGE_SIZE = 25;

export type RankingRow = {
  rank: number;
  steamId: string;
  displayName: string;
  avatarUrl: string | null;
  countryCode: string | null;
  level: number;
  value: number;
};

export type RankingsResult = {
  metric: RankingMetric;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  rows: RankingRow[];
  /** Present only for a Season's rankings; absent for Career. */
  season?: { number: number; name: string | null; startedAt: Date };
};

export function isRankingMetric(value: string): value is RankingMetric {
  return (RANKING_METRICS as string[]).includes(value);
}

export function parseRankingsPage(value: string | null | undefined): number {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

// The same "rank players by one of a few numeric metrics" problem as
// leaderboard.ts's SORT_VALUE, mapped to the equivalent column instead of a
// JS accessor, since these ranks are computed in SQL. PlayerSeasonStat has
// the same columns (and the same indexes) as PlayerCareerStat.
const CAREER_METRIC_COLUMNS: Record<RankingMetric, PgColumn> = {
  xp: playerCareerStats.xp,
  kills: playerCareerStats.kills,
  wins: playerCareerStats.matchesWon,
  streaks: playerCareerStats.highestKillStreak,
};

const SEASON_METRIC_COLUMNS: Record<RankingMetric, PgColumn> = {
  xp: playerSeasonStats.xp,
  kills: playerSeasonStats.kills,
  wins: playerSeasonStats.matchesWon,
  streaks: playerSeasonStats.highestKillStreak,
};

function emptyPage(metric: RankingMetric, page: number, scope: SeasonScope): RankingsResult {
  return {
    metric,
    page,
    pageSize: RANKINGS_PAGE_SIZE,
    totalCount: 0,
    totalPages: 0,
    rows: [],
    ...seasonField(scope),
  };
}

// Career responses carry no season field at all, so the public API's
// default (Career) response is unchanged from before Seasons existed.
function seasonField(scope: SeasonScope): Pick<RankingsResult, "season"> {
  if (scope.kind === "career") return {};
  const { number, name, startedAt } = scope.season;
  return { season: { number, name, startedAt } };
}

/**
 * Ranks players on the given Server by one gamification metric (xp, kills,
 * wins, or best kill streak), highest first - by Career totals, or by one
 * Season's totals. A Season ranks only players who played a Match in it;
 * level is always the career level. Rank and pagination are both computed
 * here, server-side - the frontend only ever renders what this returns.
 */
export async function getRankings(
  db: Database,
  baseUrl: string,
  metric: RankingMetric,
  page: number,
  scope: SeasonScope = { kind: "career" },
): Promise<RankingsResult> {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const server = await getServerByBaseUrl(db, baseUrl);

  if (!server) {
    return emptyPage(metric, safePage, scope);
  }

  const bannedSteamIds = await getBannedSteamIds(db);
  const offset = (safePage - 1) * RANKINGS_PAGE_SIZE;

  const query =
    scope.kind === "career"
      ? careerQuery(db, server.id, metric, bannedSteamIds)
      : seasonQuery(db, server.id, metric, bannedSteamIds, scope.season.id);

  const totalCount = await query.count();

  if (totalCount === 0) {
    return emptyPage(metric, safePage, scope);
  }

  const [thresholds, statRows] = await Promise.all([
    db.select().from(levelThresholds),
    query.page(offset),
  ]);

  const rows: RankingRow[] = statRows.map((row, index) => ({
    rank: offset + index + 1,
    steamId: row.steamId,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    countryCode: row.countryCode,
    level: levelForXp(row.careerXp, thresholds),
    value: Number(row.value),
  }));

  return {
    metric,
    page: safePage,
    pageSize: RANKINGS_PAGE_SIZE,
    totalCount,
    totalPages: Math.ceil(totalCount / RANKINGS_PAGE_SIZE),
    rows,
    ...seasonField(scope),
  };
}

type RankedStatRow = {
  steamId: string;
  displayName: string;
  avatarUrl: string | null;
  countryCode: string | null;
  careerXp: number;
  value: unknown;
};

type RankingsQuery = {
  count: () => Promise<number>;
  page: (offset: number) => Promise<RankedStatRow[]>;
};

function careerQuery(
  db: Database,
  serverId: number,
  metric: RankingMetric,
  bannedSteamIds: string[],
): RankingsQuery {
  const where = and(
    eq(playerCareerStats.serverId, serverId),
    notInArray(playerCareerStats.steamId, bannedSteamIds),
  );
  const column = CAREER_METRIC_COLUMNS[metric];

  return {
    count: async () => {
      const [{ value }] = await db.select({ value: count() }).from(playerCareerStats).where(where);
      return value;
    },
    page: (offset) =>
      db
        .select({
          steamId: playerCareerStats.steamId,
          displayName: playerCareerStats.displayName,
          avatarUrl: steamProfiles.avatarUrl,
          countryCode: steamProfiles.countryCode,
          careerXp: playerCareerStats.xp,
          value: column,
        })
        .from(playerCareerStats)
        // A player without a cached SteamProfile still needs to appear in the
        // rankings - a leftJoin keeps them in with null avatar/country rather
        // than dropping the row.
        .leftJoin(steamProfiles, eq(steamProfiles.steamId, playerCareerStats.steamId))
        .where(where)
        // steamId as a tiebreaker keeps ranking (and pagination) stable when
        // multiple players share the same metric value.
        .orderBy(desc(column), asc(playerCareerStats.steamId))
        .limit(RANKINGS_PAGE_SIZE)
        .offset(offset),
  };
}

function seasonQuery(
  db: Database,
  serverId: number,
  metric: RankingMetric,
  bannedSteamIds: string[],
  seasonId: number,
): RankingsQuery {
  const where = and(
    eq(playerSeasonStats.seasonId, seasonId),
    eq(playerSeasonStats.serverId, serverId),
    notInArray(playerSeasonStats.steamId, bannedSteamIds),
    // A kill in a still-open Match creates the row before any Match has
    // been played; only players who have played one belong in the Season.
    gt(playerSeasonStats.matchesPlayed, 0),
  );
  const column = SEASON_METRIC_COLUMNS[metric];

  return {
    count: async () => {
      const [{ value }] = await db.select({ value: count() }).from(playerSeasonStats).where(where);
      return value;
    },
    page: (offset) =>
      db
        .select({
          steamId: playerSeasonStats.steamId,
          displayName: playerCareerStats.displayName,
          avatarUrl: steamProfiles.avatarUrl,
          countryCode: steamProfiles.countryCode,
          careerXp: playerCareerStats.xp,
          value: column,
        })
        .from(playerSeasonStats)
        // The career row is written in the same transaction as every season
        // row, so it always exists; it holds the name and the career XP that
        // level is derived from.
        .innerJoin(
          playerCareerStats,
          and(
            eq(playerCareerStats.serverId, playerSeasonStats.serverId),
            eq(playerCareerStats.steamId, playerSeasonStats.steamId),
          ),
        )
        .leftJoin(steamProfiles, eq(steamProfiles.steamId, playerSeasonStats.steamId))
        .where(where)
        .orderBy(desc(column), asc(playerSeasonStats.steamId))
        .limit(RANKINGS_PAGE_SIZE)
        .offset(offset),
  };
}
