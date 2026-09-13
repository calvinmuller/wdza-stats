import { matches, playerCareerStats, type Database } from "@wdza-stats/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { getFactionColors } from "./live-snapshot";
import { getServerByBaseUrl } from "./server-lookup";

export interface FactionWins {
  faction: string;
  color: string | null;
  wins: number;
}

export interface ServerStatsView {
  totalMatches: number;
  totalKills: number;
  totalDeaths: number;
  uniquePlayers: number;
  factionWins: FactionWins[];
}

const EMPTY_STATS: ServerStatsView = {
  totalMatches: 0,
  totalKills: 0,
  totalDeaths: 0,
  uniquePlayers: 0,
  factionWins: [],
};

/**
 * Summarizes a Server's all-time totals: closed Matches, kills/deaths
 * (summed across every PlayerCareerStat row), unique players, and how many
 * closed Matches each Faction has won - highest win count first. A Match
 * closed before `winningFaction` existed contributes to totalMatches but not
 * to factionWins. Returns all-zero/empty when the Server isn't seeded.
 */
export async function getServerStats(
  db: Database,
  baseUrl: string,
): Promise<ServerStatsView> {
  const server = await getServerByBaseUrl(db, baseUrl);

  if (!server) {
    return EMPTY_STATS;
  }

  const [careerRows, closedMatches, factionColors] = await Promise.all([
    db
      .select()
      .from(playerCareerStats)
      .where(eq(playerCareerStats.serverId, server.id)),
    db
      .select({ winningFaction: matches.winningFaction })
      .from(matches)
      .where(and(eq(matches.serverId, server.id), isNotNull(matches.endedAt))),
    getFactionColors(db, server.id),
  ]);

  const winsByFaction = new Map<string, number>();
  for (const match of closedMatches) {
    if (!match.winningFaction) {
      continue;
    }
    winsByFaction.set(
      match.winningFaction,
      (winsByFaction.get(match.winningFaction) ?? 0) + 1,
    );
  }

  const factionWins = Array.from(winsByFaction.entries())
    .map(([faction, wins]) => ({
      faction,
      color: factionColors.get(faction) ?? null,
      wins,
    }))
    .sort((a, b) => b.wins - a.wins);

  return {
    totalMatches: closedMatches.length,
    totalKills: careerRows.reduce((sum, row) => sum + row.kills, 0),
    totalDeaths: careerRows.reduce((sum, row) => sum + row.deaths, 0),
    uniquePlayers: careerRows.length,
    factionWins,
  };
}
