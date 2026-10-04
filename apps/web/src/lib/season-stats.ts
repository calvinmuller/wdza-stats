import { playerCareerStats, playerSeasonStats } from "@wdza-stats/db";
import { and, eq, gt } from "drizzle-orm";

// Shared pieces of every query that lists players by their PlayerSeasonStat.

/**
 * The PlayerSeasonStat rows of players who played a Match in `seasonId` on
 * `serverId`. A kill in a still-open Match creates a row before any Match has
 * been played, so a row alone doesn't mean the player belongs in the Season.
 */
export function playedInSeason(seasonId: number, serverId: number) {
  return and(
    eq(playerSeasonStats.seasonId, seasonId),
    eq(playerSeasonStats.serverId, serverId),
    gt(playerSeasonStats.matchesPlayed, 0),
  );
}

/**
 * Joins a PlayerSeasonStat to the same player's PlayerCareerStat, which holds
 * their display name and the career XP their level derives from. The career
 * row is written in the same transaction as every season row, so an inner
 * join never drops a player.
 */
export const careerStatOfSeasonStat = and(
  eq(playerCareerStats.serverId, playerSeasonStats.serverId),
  eq(playerCareerStats.steamId, playerSeasonStats.steamId),
);
