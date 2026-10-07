import { matches, playerMatchStats, type Database } from "@wdza-stats/db";
import { and, desc, eq, isNotNull, sql, type SQL } from "drizzle-orm";
import type { SeasonScope } from "./season-param";

// A player's cash earned per day (summed from their PlayerMatchStats), shown
// as Cash per day on the player page.

export interface DailyCash {
  /** The UTC calendar day, as YYYY-MM-DD. */
  day: string;
  cash: number;
  matches: number;
}

// How many of the player's most recent played days to show.
const DAYS = 14;

// A Match counts towards the UTC day it ended on, the same day the page shows
// beside it everywhere else (see format-date.ts).
const endedDay = sql<string>`to_char(${matches.endedAt} at time zone 'UTC', 'YYYY-MM-DD')`;

/**
 * Cash the player earned on each of their most recent days of play on one
 * Server, within the given Season (or across all of them for Career), newest
 * day first. Days the player played no closed Match are left out rather than
 * shown as zero.
 */
export async function getPlayerDailyCash(
  db: Database,
  serverId: number,
  steamId: string,
  scope: SeasonScope,
): Promise<DailyCash[]> {
  const inScope: SQL[] = [
    eq(matches.serverId, serverId),
    eq(playerMatchStats.steamId, steamId),
    isNotNull(matches.endedAt),
    ...(scope.kind === "season" ? [eq(matches.seasonId, scope.season.id)] : []),
  ];

  return db
    .select({
      day: endedDay,
      cash: sql<number>`sum(${playerMatchStats.cash})::int`,
      matches: sql<number>`count(*)::int`,
    })
    .from(playerMatchStats)
    .innerJoin(matches, eq(matches.id, playerMatchStats.matchId))
    .where(and(...inScope))
    .groupBy(endedDay)
    .orderBy(desc(endedDay))
    .limit(DAYS);
}
