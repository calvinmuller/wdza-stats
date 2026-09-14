import { playerCareerStats, type Database } from "@wdza-stats/db";
import { eq } from "drizzle-orm";
import { getOnlineFactionColors } from "./live-snapshot";
import {
  toPlayerCareerView,
  type PlayerCareerView,
} from "./player-career-stats";
import { getServerByBaseUrl } from "./server-lookup";
import { getAvatarUrlsBySteamId, getPlaytimeMinutesBySteamId } from "./steam-profile-lookup";

export type LeaderboardSort = "kills" | "deaths" | "kd" | "cash" | "playtime";

export const LEADERBOARD_SORTS: LeaderboardSort[] = [
  "kills",
  "deaths",
  "kd",
  "cash",
  "playtime",
];

export type LeaderboardRow = PlayerCareerView & { adjustedKd: number };

// A player with no cached playtime (never fetched, or private game
// details) sorts below every player with a known value, including a
// genuine 0 - "unknown" shouldn't outrank "confirmed none".
const SORT_VALUE: Record<LeaderboardSort, (row: LeaderboardRow) => number> = {
  kills: (row) => row.kills,
  deaths: (row) => row.deaths,
  kd: (row) => row.adjustedKd,
  cash: (row) => row.cash,
  playtime: (row) => row.playtimeMinutes ?? -1,
};

// A player's raw K/D is unreliable over a handful of matches - one lucky
// game with zero deaths outranks a veteran with a great long-run record.
// Shrink each player's K/D toward the server average, weighted by matches
// played against this many "prior" matches of average performance, so a
// K/D only pulls rank once it's backed by enough games to trust it.
const KD_SHRINKAGE_PRIOR_MATCHES = 10;

function withAdjustedKd(rows: PlayerCareerView[]): LeaderboardRow[] {
  const totalKills = rows.reduce((sum, row) => sum + row.kills, 0);
  const totalDeaths = rows.reduce((sum, row) => sum + row.deaths, 0);
  const serverAverageKd = totalDeaths === 0 ? totalKills : totalKills / totalDeaths;

  return rows.map((row) => ({
    ...row,
    adjustedKd:
      (row.matchesPlayed * row.kd +
        KD_SHRINKAGE_PRIOR_MATCHES * serverAverageKd) /
      (row.matchesPlayed + KD_SHRINKAGE_PRIOR_MATCHES),
  }));
}

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

  const statRows = await db
    .select()
    .from(playerCareerStats)
    .where(eq(playerCareerStats.serverId, server.id));

  const [factionColors, avatarUrls, playtimeMinutes] = await Promise.all([
    getOnlineFactionColors(db, server.id),
    getAvatarUrlsBySteamId(db, statRows.map((row) => row.steamId)),
    getPlaytimeMinutesBySteamId(db, statRows.map((row) => row.steamId)),
  ]);

  const rows = withAdjustedKd(
    statRows.map((row) =>
      toPlayerCareerView(row, factionColors, avatarUrls, playtimeMinutes),
    ),
  );

  const value = SORT_VALUE[sort];
  return rows.sort((a, b) => value(b) - value(a));
}
