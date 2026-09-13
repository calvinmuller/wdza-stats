import { matches, playerMatchStats, type Database } from "@wdza-stats/db";
import { and, desc, eq, isNotNull, inArray } from "drizzle-orm";
import { kdRatio } from "./player-career-stats";
import { getServerByBaseUrl } from "./server-lookup";

export interface MatchHistoryView {
  id: number;
  map: string;
  experiences: string[];
  startedAt: string;
  endedAt: string;
  playerCount: number;
}

export interface PlayerMatchHistoryView {
  matchId: number;
  map: string;
  experiences: string[];
  startedAt: string;
  endedAt: string;
  faction: string;
  kills: number;
  deaths: number;
  kd: number;
  cash: number;
}

/**
 * Lists the given Server's closed Matches, most recently ended first.
 * Open Matches (endedAt still null) are excluded - a Match only belongs in
 * history once it's fully resolved. Returns an empty list when the Server
 * isn't seeded, or has no closed Matches yet.
 */
export async function getRecentMatches(
  db: Database,
  baseUrl: string,
  limit = 25,
): Promise<MatchHistoryView[]> {
  const server = await getServerByBaseUrl(db, baseUrl);

  if (!server) {
    return [];
  }

  const matchRows = await db
    .select()
    .from(matches)
    .where(and(eq(matches.serverId, server.id), isNotNull(matches.endedAt)))
    .orderBy(desc(matches.endedAt))
    .limit(limit);

  if (matchRows.length === 0) {
    return [];
  }

  const statRows = await db
    .select({ matchId: playerMatchStats.matchId })
    .from(playerMatchStats)
    .where(
      inArray(
        playerMatchStats.matchId,
        matchRows.map((match) => match.id),
      ),
    );

  const playerCountByMatchId = new Map<number, number>();
  for (const row of statRows) {
    playerCountByMatchId.set(
      row.matchId,
      (playerCountByMatchId.get(row.matchId) ?? 0) + 1,
    );
  }

  return matchRows.map((match) => ({
    id: match.id,
    map: match.map,
    experiences: match.experiences,
    startedAt: match.startedAt.toISOString(),
    endedAt: match.endedAt!.toISOString(),
    playerCount: playerCountByMatchId.get(match.id) ?? 0,
  }));
}

/**
 * Lists the closed Matches one player took part in on the given Server,
 * most recently ended first, alongside their PlayerMatchStat for each.
 * Returns an empty list when the Server isn't seeded, or the player has no
 * PlayerMatchStat rows there.
 */
export async function getPlayerMatchHistory(
  db: Database,
  baseUrl: string,
  steamId: string,
  limit = 25,
): Promise<PlayerMatchHistoryView[]> {
  const server = await getServerByBaseUrl(db, baseUrl);

  if (!server) {
    return [];
  }

  const rows = await db
    .select({
      matchId: matches.id,
      map: matches.map,
      experiences: matches.experiences,
      startedAt: matches.startedAt,
      endedAt: matches.endedAt,
      faction: playerMatchStats.faction,
      kills: playerMatchStats.kills,
      deaths: playerMatchStats.deaths,
      cash: playerMatchStats.cash,
    })
    .from(playerMatchStats)
    .innerJoin(matches, eq(matches.id, playerMatchStats.matchId))
    .where(
      and(
        eq(matches.serverId, server.id),
        eq(playerMatchStats.steamId, steamId),
        isNotNull(matches.endedAt),
      ),
    )
    .orderBy(desc(matches.endedAt))
    .limit(limit);

  return rows.map((row) => ({
    matchId: row.matchId,
    map: row.map,
    experiences: row.experiences,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt!.toISOString(),
    faction: row.faction,
    kills: row.kills,
    deaths: row.deaths,
    kd: kdRatio(row.kills, row.deaths),
    cash: row.cash,
  }));
}
