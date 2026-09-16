import {
  gameEvents,
  matches,
  playerCareerStats,
  playerMatchStats,
  type Database,
  type GameEventType,
} from "@wdza-stats/db";
import { and, asc, count, desc, eq, isNotNull, inArray } from "drizzle-orm";
import { kdRatio } from "./player-career-stats";
import { getServerByBaseUrl } from "./server-lookup";
import { getAvatarUrlsBySteamId, getCountryCodesBySteamId } from "./steam-profile-lookup";

export const MATCHES_PAGE_SIZE = 25;

export interface MatchHistoryView {
  id: number;
  map: string;
  experiences: string[];
  startedAt: string;
  endedAt: string;
  playerCount: number;
  winningFaction: string | null;
  mvpPlayerSteamId: string | null;
  mvpDisplayName: string | null;
}

export interface MatchesPageResult {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  rows: MatchHistoryView[];
}

export interface MatchPlayerStatView {
  steamId: string;
  displayName: string;
  faction: string;
  kills: number;
  deaths: number;
  kd: number;
  cash: number;
  avatarUrl: string | null;
  countryCode: string | null;
}

export interface MatchFirstBloodView {
  killerSteamId: string;
  killerDisplayName: string;
  victimSteamId: string | null;
  victimDisplayName: string | null;
}

export interface MatchDetailView {
  id: number;
  map: string;
  experiences: string[];
  startedAt: string;
  endedAt: string;
  winningFaction: string | null;
  mvpPlayerSteamId: string | null;
  mvpDisplayName: string | null;
  mvpScore: number | null;
  totalKills: number;
  totalDeaths: number;
  totalCash: number;
  players: MatchPlayerStatView[];
  firstBlood: MatchFirstBloodView | null;
}

// Kill/death GameEvents are inferred from ~15s RCON snapshot polls (see
// game-events.ts's diffKillDeathGameEvents), not a real kill feed: every
// event from the same poll shares one timestamp, and PlayerKilled never
// carries a victim (targetSteamId is always null - there's no safe
// killer/victim attribution within a poll window). So "first blood" here is
// necessarily a best-effort read of that same data: the match's earliest
// PlayerKilled event names a killer only when that poll's earliest kills all
// belong to one player (otherwise we can't tell who was truly first), and
// names a victim only when that same poll's earliest deaths all belong to
// one player. Ambiguous cases return null/no victim rather than guessing.
const FIRST_BLOOD_CANDIDATE_LIMIT = 20;

async function getFirstBloodView(
  db: Database,
  matchId: number,
  displayNameBySteamId: Map<string, string>,
): Promise<MatchFirstBloodView | null> {
  const [killRows, deathRows] = await Promise.all([
    db
      .select({ steamId: gameEvents.steamId, timestamp: gameEvents.timestamp })
      .from(gameEvents)
      .where(and(eq(gameEvents.matchId, matchId), eq(gameEvents.type, "PlayerKilled" satisfies GameEventType)))
      .orderBy(asc(gameEvents.id))
      .limit(FIRST_BLOOD_CANDIDATE_LIMIT),
    db
      .select({ steamId: gameEvents.steamId, timestamp: gameEvents.timestamp })
      .from(gameEvents)
      .where(and(eq(gameEvents.matchId, matchId), eq(gameEvents.type, "PlayerDeath" satisfies GameEventType)))
      .orderBy(asc(gameEvents.id))
      .limit(FIRST_BLOOD_CANDIDATE_LIMIT),
  ]);

  if (killRows.length === 0) {
    return null;
  }

  const earliestKillTimestamp = killRows[0].timestamp.getTime();
  const killersAtEarliest = new Set(
    killRows
      .filter((row) => row.timestamp.getTime() === earliestKillTimestamp)
      .flatMap((row) => (row.steamId ? [row.steamId] : [])),
  );

  if (killersAtEarliest.size !== 1) {
    return null;
  }
  const killerSteamId = [...killersAtEarliest][0];

  const victimsAtEarliest = new Set(
    deathRows
      .filter((row) => row.timestamp.getTime() === earliestKillTimestamp)
      .flatMap((row) => (row.steamId ? [row.steamId] : [])),
  );
  const victimSteamId = victimsAtEarliest.size === 1 ? [...victimsAtEarliest][0] : null;

  return {
    killerSteamId,
    killerDisplayName: displayNameBySteamId.get(killerSteamId) ?? killerSteamId,
    victimSteamId,
    victimDisplayName: victimSteamId
      ? displayNameBySteamId.get(victimSteamId) ?? victimSteamId
      : null,
  };
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
 * Batched displayName lookup for a list of steamIds on one Server -
 * playerCareerStats is keyed by (serverId, steamId), not steamId alone, so
 * this is scoped per-Server like getMatchDetail's own join. Omits any
 * steamId with no PlayerCareerStat row on this Server, so callers fall
 * back to the raw steamId the same way getMatchDetail does.
 */
async function getDisplayNamesBySteamId(
  db: Database,
  serverId: number,
  steamIds: string[],
): Promise<Map<string, string>> {
  if (steamIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      steamId: playerCareerStats.steamId,
      displayName: playerCareerStats.displayName,
    })
    .from(playerCareerStats)
    .where(
      and(
        eq(playerCareerStats.serverId, serverId),
        inArray(playerCareerStats.steamId, Array.from(new Set(steamIds))),
      ),
    );

  return new Map(rows.map((row) => [row.steamId, row.displayName]));
}

function emptyMatchesPage(page: number): MatchesPageResult {
  return { page, pageSize: MATCHES_PAGE_SIZE, totalCount: 0, totalPages: 0, rows: [] };
}

export function parseMatchesPage(value: string | null | undefined): number {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

/**
 * Lists the given Server's closed Matches, most recently ended first, with
 * map/date/winner/MVP/player count per Match. Open Matches (endedAt still
 * null) are excluded - a Match only belongs in history once it's fully
 * resolved. Pagination is computed here, server-side, mirroring
 * rankings.ts's getRankings - the frontend only ever renders what this
 * returns. Returns an empty page (rows: [], totalCount possibly > 0 for a
 * page past the last one) when the Server isn't seeded, has no closed
 * Matches yet, or the requested page is out of range.
 */
export async function getMatchesPage(
  db: Database,
  baseUrl: string,
  page = 1,
): Promise<MatchesPageResult> {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const server = await getServerByBaseUrl(db, baseUrl);

  if (!server) {
    return emptyMatchesPage(safePage);
  }

  const [{ value: totalCount }] = await db
    .select({ value: count() })
    .from(matches)
    .where(and(eq(matches.serverId, server.id), isNotNull(matches.endedAt)));

  if (totalCount === 0) {
    return emptyMatchesPage(safePage);
  }

  const offset = (safePage - 1) * MATCHES_PAGE_SIZE;

  const matchRows = await db
    .select()
    .from(matches)
    .where(and(eq(matches.serverId, server.id), isNotNull(matches.endedAt)))
    .orderBy(desc(matches.endedAt))
    .limit(MATCHES_PAGE_SIZE)
    .offset(offset);

  const totalPages = Math.ceil(totalCount / MATCHES_PAGE_SIZE);

  if (matchRows.length === 0) {
    return { page: safePage, pageSize: MATCHES_PAGE_SIZE, totalCount, totalPages, rows: [] };
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

  const mvpSteamIds = matchRows.flatMap((match) =>
    match.mvpPlayerSteamId ? [match.mvpPlayerSteamId] : [],
  );
  const mvpDisplayNames = await getDisplayNamesBySteamId(db, server.id, mvpSteamIds);

  const rows: MatchHistoryView[] = matchRows.map((match) => ({
    id: match.id,
    map: match.map,
    experiences: match.experiences,
    startedAt: match.startedAt.toISOString(),
    endedAt: match.endedAt!.toISOString(),
    playerCount: playerCountByMatchId.get(match.id) ?? 0,
    winningFaction: match.winningFaction,
    mvpPlayerSteamId: match.mvpPlayerSteamId,
    mvpDisplayName: match.mvpPlayerSteamId
      ? mvpDisplayNames.get(match.mvpPlayerSteamId) ?? match.mvpPlayerSteamId
      : null,
  }));

  return { page: safePage, pageSize: MATCHES_PAGE_SIZE, totalCount, totalPages, rows };
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

/**
 * Reads one closed Match's full detail on the given Server - the winning
 * Faction, MVP, server-wide totals, and every player's PlayerMatchStat,
 * most kills first (so callers get "top players by kills" for free).
 * Returns null when the Server isn't seeded, the Match doesn't belong to
 * it, or the Match is still open.
 */
export async function getMatchDetail(
  db: Database,
  baseUrl: string,
  matchId: number,
): Promise<MatchDetailView | null> {
  const server = await getServerByBaseUrl(db, baseUrl);

  if (!server) {
    return null;
  }

  const [match] = await db
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.id, matchId),
        eq(matches.serverId, server.id),
        isNotNull(matches.endedAt),
      ),
    )
    .limit(1);

  if (!match) {
    return null;
  }

  const rows = await db
    .select({
      steamId: playerMatchStats.steamId,
      faction: playerMatchStats.faction,
      kills: playerMatchStats.kills,
      deaths: playerMatchStats.deaths,
      cash: playerMatchStats.cash,
      displayName: playerCareerStats.displayName,
    })
    .from(playerMatchStats)
    .leftJoin(
      playerCareerStats,
      and(
        eq(playerCareerStats.steamId, playerMatchStats.steamId),
        eq(playerCareerStats.serverId, server.id),
      ),
    )
    .where(eq(playerMatchStats.matchId, matchId))
    .orderBy(desc(playerMatchStats.kills));

  const [avatarUrls, countryCodes] = await Promise.all([
    getAvatarUrlsBySteamId(db, rows.map((row) => row.steamId)),
    getCountryCodesBySteamId(db, rows.map((row) => row.steamId)),
  ]);

  const players: MatchPlayerStatView[] = rows.map((row) => ({
    steamId: row.steamId,
    displayName: row.displayName ?? row.steamId,
    faction: row.faction,
    kills: row.kills,
    deaths: row.deaths,
    kd: kdRatio(row.kills, row.deaths),
    cash: row.cash,
    avatarUrl: avatarUrls.get(row.steamId) ?? null,
    countryCode: countryCodes.get(row.steamId) ?? null,
  }));

  const mvpPlayer = match.mvpPlayerSteamId
    ? players.find((player) => player.steamId === match.mvpPlayerSteamId)
    : undefined;

  const displayNameBySteamId = new Map(players.map((player) => [player.steamId, player.displayName]));
  const firstBlood = await getFirstBloodView(db, matchId, displayNameBySteamId);

  return {
    id: match.id,
    map: match.map,
    experiences: match.experiences,
    startedAt: match.startedAt.toISOString(),
    endedAt: match.endedAt!.toISOString(),
    winningFaction: match.winningFaction,
    mvpPlayerSteamId: match.mvpPlayerSteamId,
    mvpDisplayName: mvpPlayer?.displayName ?? match.mvpPlayerSteamId,
    mvpScore: match.mvpScore,
    totalKills: players.reduce((sum, player) => sum + player.kills, 0),
    totalDeaths: players.reduce((sum, player) => sum + player.deaths, 0),
    totalCash: players.reduce((sum, player) => sum + player.cash, 0),
    players,
    firstBlood,
  };
}
