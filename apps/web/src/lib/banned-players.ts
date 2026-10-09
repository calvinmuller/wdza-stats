import { bannedPlayers, type Database } from "@wdza-stats/db";

// Every public read built from playerCareerStats (leaderboard, rankings,
// server-stats, player search/profile, the Podium and PlayerOverallStat) and
// from the kill feed (weapon stats, top weapons) excludes BannedPlayer
// steamIds - see
// schema.ts's bannedPlayers doc comment. The Worker already stops writing
// new activity for a banned steamId (apps/worker/src/match-tracker.ts's
// filterBannedPlayers), but a row already on the books before the ban stays
// in the table, so callers here still need this filter to hide it.

export async function getBannedSteamIds(db: Database): Promise<string[]> {
  const rows = await db.select({ steamId: bannedPlayers.steamId }).from(bannedPlayers);
  return rows.map((row) => row.steamId);
}
