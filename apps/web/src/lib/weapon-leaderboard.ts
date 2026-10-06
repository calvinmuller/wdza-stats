import { kills, matches, playerCareerStats, steamProfiles, type Database } from "@wdza-stats/db";
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  ne,
  not,
  notInArray,
  sql,
  type SQL,
} from "drizzle-orm";
import { weaponName } from "./describe-kill";
import type { KillScope } from "./kill-scope";
import { weaponSlug } from "./weapon-slug";

// The weapon leaderboard: players ranked by their Kills with one weapon
// inside one KillScope (a Window, the current Season, or all time). Built
// from the kill feed alone - see Kill and Window in CONTEXT.md - so it starts
// from whenever the feed was switched on.

export const WEAPON_LEADERBOARD_SIZE = 50;

/** One weapon a Server has seen a Kill with. */
export interface ServerWeapon {
  /** The raw tag the game sent, e.g. Id.Item.AK74M. */
  cause: string;
  /** Its display name, e.g. AK74. */
  weapon: string;
  /** Its name in a URL, e.g. ak74. */
  slug: string;
}

export interface WeaponLeaderboardRow {
  rank: number;
  steamId: string;
  displayName: string;
  avatarUrl: string | null;
  countryCode: string | null;
  kills: number;
  headshots: number;
}

export interface WeaponLeaderboard {
  /** Every Kill with the weapon in the scope, ranked players and beyond. */
  totalKills: number;
  /** How many players have a Kill with the weapon in the scope. */
  playerCount: number;
  rows: WeaponLeaderboardRow[];
}

// A roadkill or a vehicle blowing up is "a vehicle", not a weapon, however
// the game tagged its cause.
const VEHICLE_KILL_TAGS = ["RoadKill", "VehicleExplosion"];

/**
 * Kills that count towards a weapon on `serverId`: made by someone else,
 * with a named weapon, not by a banned player. Suicides and deaths by the
 * environment are nobody's Kill.
 */
function weaponKills(serverId: number, bannedSteamIds: string[]): SQL[] {
  return [
    eq(kills.serverId, serverId),
    isNotNull(kills.killerSteamId),
    ne(kills.killerSteamId, kills.victimSteamId),
    not(kills.suicide),
    isNotNull(kills.cause),
    ...VEHICLE_KILL_TAGS.map((tag) => not(sql`${kills.tags} @> ${JSON.stringify([tag])}::jsonb`)),
    notInArray(kills.killerSteamId, bannedSteamIds),
  ];
}

/**
 * Which of a Server's Kills fall in the scope. A Window counts by when the
 * feed delivered the Kill, a Match open or not; a Season counts the Kills of
 * that Season's Matches; all time counts everything.
 */
function inScope(scope: KillScope): SQL[] {
  switch (scope.kind) {
    case "window":
      return [gte(kills.receivedAt, sql`now() - make_interval(days => ${scope.days})`)];
    case "season":
      return [
        inArray(
          kills.matchRow,
          sql`(select ${matches.id} from ${matches} where ${matches.seasonId} = ${scope.season.id})`,
        ),
      ];
    case "career":
      return [];
  }
}

function toServerWeapon(cause: string): ServerWeapon {
  return { cause, weapon: weaponName(cause)!, slug: weaponSlug(cause) };
}

/**
 * Every weapon with at least one counting Kill on the Server, all time,
 * alphabetical by display name. The list is the same whichever scope is
 * shown, so a weapon never vanishes from the picker when the Window shrinks.
 */
export async function listServerWeapons(
  db: Database,
  serverId: number,
  bannedSteamIds: string[],
): Promise<ServerWeapon[]> {
  const rows = await db
    .selectDistinct({ cause: kills.cause })
    .from(kills)
    .where(and(...weaponKills(serverId, bannedSteamIds)));

  return rows
    .map((row) => toServerWeapon(row.cause!))
    .sort((a, b) => a.weapon.localeCompare(b.weapon, "en"));
}

/**
 * The cause tag with the most counting Kills in the scope, or null when the
 * scope has none. Ties go to the first tag alphabetically, so the default
 * weapon is stable between two page loads.
 */
export async function mostUsedWeapon(
  db: Database,
  serverId: number,
  scope: KillScope,
  bannedSteamIds: string[],
): Promise<string | null> {
  const killCount = count();
  const [row] = await db
    .select({ cause: kills.cause, kills: killCount })
    .from(kills)
    .where(and(...weaponKills(serverId, bannedSteamIds), ...inScope(scope)))
    .groupBy(kills.cause)
    .orderBy(desc(killCount), asc(kills.cause))
    .limit(1);

  return row?.cause ?? null;
}

/**
 * Players ranked by Kills with `cause` in the scope on the Server, most
 * first, ties by headshots then name, the top WEAPON_LEADERBOARD_SIZE only.
 * Named by PlayerCareerStat where the player has one, otherwise by the name
 * on their latest Kill: a player can have Kills without ever finishing a
 * Match.
 */
export async function getWeaponLeaderboard(
  db: Database,
  serverId: number,
  cause: string,
  scope: KillScope,
  bannedSteamIds: string[],
): Promise<WeaponLeaderboard> {
  const where = and(
    ...weaponKills(serverId, bannedSteamIds),
    eq(kills.cause, cause),
    ...inScope(scope),
  );

  const [[summary], rows] = await Promise.all([
    db
      .select({ totalKills: count(), playerCount: countDistinct(kills.killerSteamId) })
      .from(kills)
      .where(where),
    rankedRows(db, where),
  ]);

  return {
    totalKills: summary.totalKills,
    playerCount: summary.playerCount,
    rows: rows.map((row, index) => ({
      rank: index + 1,
      steamId: row.steamId!,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      countryCode: row.countryCode,
      kills: row.kills,
      headshots: row.headshots,
    })),
  };
}

function rankedRows(db: Database, where: SQL | undefined) {
  const killCount = count();
  const headshots = sql<number>`count(*) filter (where ${kills.headshot})`.mapWith(Number);
  const latestKillerName = sql<string>`(array_agg(${kills.killerName} order by ${kills.id} desc))[1]`;
  const displayName = sql<string>`coalesce(${playerCareerStats.displayName}, ${latestKillerName})`;

  return db
    .select({
      steamId: kills.killerSteamId,
      displayName,
      avatarUrl: steamProfiles.avatarUrl,
      countryCode: steamProfiles.countryCode,
      kills: killCount,
      headshots,
    })
    .from(kills)
    // Left joins: a killer with no career row or no cached SteamProfile is
    // still ranked, with the fallbacks above.
    .leftJoin(
      playerCareerStats,
      and(
        eq(playerCareerStats.serverId, kills.serverId),
        eq(playerCareerStats.steamId, kills.killerSteamId),
      ),
    )
    .leftJoin(steamProfiles, eq(steamProfiles.steamId, kills.killerSteamId))
    .where(where)
    .groupBy(
      kills.killerSteamId,
      playerCareerStats.displayName,
      steamProfiles.avatarUrl,
      steamProfiles.countryCode,
    )
    .orderBy(desc(killCount), desc(headshots), asc(displayName))
    .limit(WEAPON_LEADERBOARD_SIZE);
}
