import { playerCareerStats, type Database } from "@wdza-stats/db";
import { eq } from "drizzle-orm";
import { getOnlineFactionColors } from "./live-snapshot";
import {
  toPlayerCareerView,
  type PlayerCareerView,
} from "./player-career-stats";
import { getServerByBaseUrl } from "./server-lookup";

export type LeaderboardSort = "kills" | "deaths" | "kd" | "cash";

export const LEADERBOARD_SORTS: LeaderboardSort[] = [
  "kills",
  "deaths",
  "kd",
  "cash",
];

export type LeaderboardRow = PlayerCareerView;

const SORT_VALUE: Record<LeaderboardSort, (row: LeaderboardRow) => number> = {
  kills: (row) => row.kills,
  deaths: (row) => row.deaths,
  kd: (row) => row.kd,
  cash: (row) => row.cash,
};

/**
 * Ranks every player with a PlayerCareerStat on the given Server, highest
 * value of `sort` first. Returns an empty list when the Server isn't
 * seeded, or has no PlayerCareerStat rows yet.
 */
export async function getLeaderboard(
  db: Database,
  baseUrl: string,
  sort: LeaderboardSort,
): Promise<LeaderboardRow[]> {
  const server = await getServerByBaseUrl(db, baseUrl);

  if (!server) {
    return [];
  }

  const [statRows, factionColors] = await Promise.all([
    db
      .select()
      .from(playerCareerStats)
      .where(eq(playerCareerStats.serverId, server.id)),
    getOnlineFactionColors(db, server.id),
  ]);

  const rows = statRows.map((row) => toPlayerCareerView(row, factionColors));

  const value = SORT_VALUE[sort];
  return rows.sort((a, b) => value(b) - value(a));
}
