import { currentSeason, playerSeasonStats, servers, type Database, type Season } from "@wdza-stats/db";
import { and, asc, desc, eq, gt, notInArray, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getBannedSteamIds } from "./banned-players";
import { kdRatio } from "./player-career-stats";
import { getOverallIdentities } from "./player-overall";

// The Podium (see CONTEXT.md): the three players whose PlayerOverallStat for
// the current Season holds the most XP, across every enabled Server - plus the
// Runners-up, the next few places shown beneath it.

export const PODIUM_SIZE = 3;
export const RUNNERS_UP_SIZE = 5;

export interface PodiumPlace {
  place: number;
  steamId: string;
  displayName: string;
  avatarUrl: string | null;
  countryCode: string | null;
  /** The overall level: from career XP summed across every enabled Server. */
  level: number;
  /** Season XP summed across every enabled Server - what the Podium ranks by. */
  xp: number;
  kills: number;
  deaths: number;
  kd: number;
  matchesWon: number;
}

export interface Podium {
  season: Season;
  /** Up to PODIUM_SIZE places, first place first; fewer early in a Season. */
  places: PodiumPlace[];
  /** Up to RUNNERS_UP_SIZE places after the Podium, ranked the same way. */
  runnersUp: PodiumPlace[];
}

const sum = (column: AnyPgColumn) => sql<number>`sum(${column})`.mapWith(Number);

/**
 * The current Season's Podium and its Runners-up. Ties go to more Season kills, then to the
 * lower steamId, so the order is stable between two page loads. Only players
 * who played a Match this Season on an enabled Server, and aren't banned.
 */
export async function getPodium(db: Database): Promise<Podium> {
  const [season, bannedSteamIds] = await Promise.all([currentSeason(db), getBannedSteamIds(db)]);

  const xp = sum(playerSeasonStats.xp);
  const kills = sum(playerSeasonStats.kills);
  const rows = await db
    .select({
      steamId: playerSeasonStats.steamId,
      xp,
      kills,
      deaths: sum(playerSeasonStats.deaths),
      matchesWon: sum(playerSeasonStats.matchesWon),
    })
    .from(playerSeasonStats)
    .innerJoin(servers, and(eq(servers.id, playerSeasonStats.serverId), eq(servers.enabled, true)))
    .where(
      and(
        eq(playerSeasonStats.seasonId, season.id),
        gt(playerSeasonStats.matchesPlayed, 0),
        notInArray(playerSeasonStats.steamId, bannedSteamIds),
      ),
    )
    .groupBy(playerSeasonStats.steamId)
    .orderBy(desc(xp), desc(kills), asc(playerSeasonStats.steamId))
    .limit(PODIUM_SIZE + RUNNERS_UP_SIZE);

  const identities = await getOverallIdentities(
    db,
    rows.map((row) => row.steamId),
  );

  // Every PlayerSeasonStat has a PlayerCareerStat beside it (written in the
  // same transaction), so no row should go missing here.
  const ranked: PodiumPlace[] = rows.flatMap((row, index) => {
    const identity = identities.get(row.steamId);
    if (!identity) return [];
    return {
      place: index + 1,
      steamId: row.steamId,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
      countryCode: identity.countryCode,
      level: identity.level,
      xp: row.xp,
      kills: row.kills,
      deaths: row.deaths,
      kd: kdRatio(row.kills, row.deaths),
      matchesWon: row.matchesWon,
    };
  });

  return {
    season,
    places: ranked.filter((each) => each.place <= PODIUM_SIZE),
    runnersUp: ranked.filter((each) => each.place > PODIUM_SIZE),
  };
}
