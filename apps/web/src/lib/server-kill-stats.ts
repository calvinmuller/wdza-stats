import { kills, playerCareerStats, type Database } from "@wdza-stats/db";
import { and, asc, count, desc, eq, inArray, isNotNull, ne, not, notInArray, sql, type SQL } from "drizzle-orm";
import { weaponName } from "./describe-kill";
import type { KillScope } from "./kill-scope";
import { killsInScope } from "./weapon-leaderboard";

// A Server's kill-feed stats across every player (see Kill in CONTEXT.md).
// Only Kills the feed reported are counted, so these start from whenever the
// feed was switched on, unlike the Snapshot-derived kill totals.

export const SERVER_WEAPONS_SIZE = 12;
export const LONGEST_KILLS_SIZE = 5;
export const TOP_KILLERS_SIZE = 50;

export interface ServerWeaponStat {
  /** The raw tag the game sent, e.g. Id.Item.AK74M. */
  cause: string;
  weapon: string;
  kills: number;
  headshots: number;
}

// Dates as ISO strings, so the view can be handed to a client component as-is.
export interface LongestKill {
  id: number;
  receivedAt: string;
  killerSteamId: string;
  killerName: string;
  victimSteamId: string;
  victimName: string;
  weapon: string | null;
  distanceM: number;
}

export interface TopKiller {
  steamId: string;
  displayName: string;
  kills: number;
  deaths: number;
  headshots: number;
  /** Kills of a player on the killer's own Faction. */
  teamKills: number;
  /** Whole metres; null when the game reported no distance for any of the Kills. */
  averageM: number | null;
}

/**
 * Kills someone made on `serverId` in the scope: not suicides, not deaths by
 * the environment, not by a banned player. Unlike the weapon leaderboard,
 * roadkills and vehicle explosions count, under whatever cause the game
 * tagged them with.
 */
function playerKills(serverId: number, scope: KillScope, bannedSteamIds: string[]): SQL[] {
  return [
    eq(kills.serverId, serverId),
    isNotNull(kills.killerSteamId),
    ne(kills.killerSteamId, kills.victimSteamId),
    not(kills.suicide),
    notInArray(kills.killerSteamId, bannedSteamIds),
    ...killsInScope(scope),
  ];
}

/**
 * The Server's most-used weapons and vehicles in the scope, most kills first,
 * ties by cause tag, the top SERVER_WEAPONS_SIZE only.
 */
export async function getServerWeaponStats(
  db: Database,
  serverId: number,
  scope: KillScope,
  bannedSteamIds: string[],
): Promise<ServerWeaponStat[]> {
  const killCount = count();
  const rows = await db
    .select({
      cause: kills.cause,
      kills: killCount,
      headshots: sql<number>`count(*) filter (where ${kills.headshot})`.mapWith(Number),
    })
    .from(kills)
    .where(and(...playerKills(serverId, scope, bannedSteamIds), isNotNull(kills.cause)))
    .groupBy(kills.cause)
    .orderBy(desc(killCount), kills.cause)
    .limit(SERVER_WEAPONS_SIZE);

  return rows.map((row) => ({
    cause: row.cause!,
    weapon: weaponName(row.cause)!,
    kills: row.kills,
    headshots: row.headshots,
  }));
}

/**
 * The Server's longest Kills in the scope, longest first, ties by earliest
 * delivered, the top LONGEST_KILLS_SIZE only. A Kill the game reported no
 * distance for can't be among them. Names are as the feed reported them at
 * the time of the Kill.
 */
export async function getLongestKills(
  db: Database,
  serverId: number,
  scope: KillScope,
  bannedSteamIds: string[],
): Promise<LongestKill[]> {
  const rows = await db
    .select({
      id: kills.id,
      receivedAt: kills.receivedAt,
      killerSteamId: kills.killerSteamId,
      killerName: kills.killerName,
      victimSteamId: kills.victimSteamId,
      victimName: kills.victimName,
      cause: kills.cause,
      distanceM: kills.distanceM,
    })
    .from(kills)
    .where(and(...playerKills(serverId, scope, bannedSteamIds), isNotNull(kills.distanceM)))
    .orderBy(desc(kills.distanceM), kills.id)
    .limit(LONGEST_KILLS_SIZE);

  return rows.map((row) => ({
    id: row.id,
    receivedAt: row.receivedAt.toISOString(),
    killerSteamId: row.killerSteamId!,
    killerName: row.killerName ?? row.killerSteamId!,
    victimSteamId: row.victimSteamId,
    victimName: row.victimName,
    weapon: weaponName(row.cause),
    distanceM: Math.round(row.distanceM!),
  }));
}

/**
 * The Server's players ranked by Kills in the scope, most first, ties by
 * headshots then name, the top TOP_KILLERS_SIZE only. Kills include team
 * kills, which are also counted on their own. Deaths are every Kill the
 * player was the victim of, suicides and deaths by the environment included.
 * Named by PlayerCareerStat where the player has one, otherwise by the name
 * on their latest Kill: a player can have Kills without ever finishing a
 * Match.
 */
export async function getTopKillers(
  db: Database,
  serverId: number,
  scope: KillScope,
  bannedSteamIds: string[],
): Promise<TopKiller[]> {
  const killCount = count();
  const headshots = sql<number>`count(*) filter (where ${kills.headshot})`.mapWith(Number);
  const latestKillerName = sql<string>`(array_agg(${kills.killerName} order by ${kills.id} desc))[1]`;
  const displayName = sql<string>`coalesce(${playerCareerStats.displayName}, ${latestKillerName}, ${kills.killerSteamId})`;

  const rows = await db
    .select({
      steamId: kills.killerSteamId,
      displayName,
      kills: killCount,
      headshots,
      teamKills: sql<number>`count(*) filter (where ${kills.killerFaction} = ${kills.victimFaction})`.mapWith(Number),
      averageM: sql<number | null>`avg(${kills.distanceM})`.mapWith(Number),
    })
    .from(kills)
    .leftJoin(
      playerCareerStats,
      and(eq(playerCareerStats.serverId, kills.serverId), eq(playerCareerStats.steamId, kills.killerSteamId)),
    )
    .where(and(...playerKills(serverId, scope, bannedSteamIds)))
    .groupBy(kills.killerSteamId, playerCareerStats.displayName)
    .orderBy(desc(killCount), desc(headshots), asc(displayName))
    .limit(TOP_KILLERS_SIZE);

  const steamIds = rows.map((row) => row.steamId!);
  const deathRows =
    steamIds.length === 0
      ? []
      : await db
          .select({ steamId: kills.victimSteamId, deaths: count() })
          .from(kills)
          .where(and(eq(kills.serverId, serverId), inArray(kills.victimSteamId, steamIds), ...killsInScope(scope)))
          .groupBy(kills.victimSteamId);
  const deathsBySteamId = new Map(deathRows.map((row) => [row.steamId, row.deaths]));

  return rows.map((row) => ({
    steamId: row.steamId!,
    displayName: row.displayName,
    kills: row.kills,
    deaths: deathsBySteamId.get(row.steamId!) ?? 0,
    headshots: row.headshots,
    teamKills: row.teamKills,
    averageM: row.averageM === null ? null : Math.round(row.averageM),
  }));
}
