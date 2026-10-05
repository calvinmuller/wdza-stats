import { matches, playerCareerStats, playerSeasonStats, type Database } from "@wdza-stats/db";
import { and, eq, isNotNull, notInArray } from "drizzle-orm";
import { getBannedSteamIds } from "./banned-players";
import { getFactionColors } from "./live-snapshot";
import type { SeasonScope } from "./season-param";
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
 * Summarizes a Server's totals - all-time for Career, or one Season's:
 * closed Matches, kills/deaths (summed across every PlayerCareerStat or
 * PlayerSeasonStat row), unique players, and how many closed Matches each
 * Faction has won - highest win count first. Kills and deaths include those
 * from a still-open Match, in a Season as in Career, so the Seasons' totals
 * always add up to Career's; unique players in a Season are those who have
 * played a Match in it. A Match closed before `winningFaction` existed
 * contributes to totalMatches but not to factionWins. Returns all-zero/empty
 * when the Server isn't seeded.
 */
export async function getServerStats(
  db: Database,
  baseUrl: string,
  scope: SeasonScope = { kind: "career" },
): Promise<ServerStatsView> {
  const server = await getServerByBaseUrl(db, baseUrl);

  if (!server) {
    return EMPTY_STATS;
  }

  const bannedSteamIds = await getBannedSteamIds(db);

  const [statRows, closedMatches, factionColors] = await Promise.all([
    scope.kind === "career"
      ? db
          .select({
            kills: playerCareerStats.kills,
            deaths: playerCareerStats.deaths,
            matchesPlayed: playerCareerStats.matchesPlayed,
          })
          .from(playerCareerStats)
          .where(
            and(
              eq(playerCareerStats.serverId, server.id),
              notInArray(playerCareerStats.steamId, bannedSteamIds),
            ),
          )
      : db
          .select({
            kills: playerSeasonStats.kills,
            deaths: playerSeasonStats.deaths,
            matchesPlayed: playerSeasonStats.matchesPlayed,
          })
          .from(playerSeasonStats)
          .where(
            and(
              eq(playerSeasonStats.seasonId, scope.season.id),
              eq(playerSeasonStats.serverId, server.id),
              notInArray(playerSeasonStats.steamId, bannedSteamIds),
            ),
          ),
    db
      .select({ winningFaction: matches.winningFaction })
      .from(matches)
      .where(
        and(
          eq(matches.serverId, server.id),
          isNotNull(matches.endedAt),
          scope.kind === "season" ? eq(matches.seasonId, scope.season.id) : undefined,
        ),
      ),
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
    totalKills: statRows.reduce((sum, row) => sum + row.kills, 0),
    totalDeaths: statRows.reduce((sum, row) => sum + row.deaths, 0),
    // Career counts every player seen on the Server, as before Seasons; a
    // Season's row can exist before its player has played a Match in it.
    uniquePlayers:
      scope.kind === "career"
        ? statRows.length
        : statRows.filter((row) => row.matchesPlayed > 0).length,
    factionWins,
  };
}
