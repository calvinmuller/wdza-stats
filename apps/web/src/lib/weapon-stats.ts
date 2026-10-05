import { kills, matches, type Database } from "@wdza-stats/db";
import { and, count, desc, eq, isNotNull, ne, not, sql, type SQL } from "drizzle-orm";
import { weaponName } from "./describe-kill";
import type { SeasonScope } from "./season-param";

// A player's Kills per weapon, from the kill feed (see Kill in CONTEXT.md).
// Only Kills the feed reported are counted, so this starts from whenever the
// feed was switched on, unlike the Snapshot-derived kill totals.

export interface WeaponStat {
  /** The raw tag the game sent, e.g. Id.Item.AK74M. */
  cause: string;
  weapon: string;
  kills: number;
  headshots: number;
  /** Whole metres; null when the game reported no distance for any of them. */
  longestM: number | null;
  averageM: number | null;
}

/**
 * The player's Kills on one Server grouped by weapon, most kills first.
 * Suicides and deaths by the environment are nobody's Kill, so they never
 * count. A Season scope counts the Kills that arrived during that Season's
 * Matches; Career counts every Kill, including any that arrived while no
 * Match was open.
 */
export async function getPlayerWeaponStats(
  db: Database,
  serverId: number,
  steamId: string,
  scope: SeasonScope,
): Promise<WeaponStat[]> {
  const conditions: SQL[] = [
    eq(kills.serverId, serverId),
    eq(kills.killerSteamId, steamId),
    ne(kills.victimSteamId, steamId),
    not(kills.suicide),
    isNotNull(kills.cause),
  ];

  const killCount = count();
  const base = db
    .select({
      cause: kills.cause,
      kills: killCount,
      headshots: sql<number>`count(*) filter (where ${kills.headshot})`.mapWith(Number),
      longestM: sql<number | null>`max(${kills.distanceM})`.mapWith(Number),
      averageM: sql<number | null>`avg(${kills.distanceM})`.mapWith(Number),
    })
    .from(kills);

  const query =
    scope.kind === "career"
      ? base.where(and(...conditions))
      : base
          .innerJoin(matches, eq(matches.id, kills.matchRow))
          .where(and(...conditions, eq(matches.seasonId, scope.season.id)));

  const rows = await query.groupBy(kills.cause).orderBy(desc(killCount), kills.cause);

  return rows.map((row) => ({
    cause: row.cause!,
    weapon: weaponName(row.cause)!,
    kills: row.kills,
    headshots: row.headshots,
    longestM: row.longestM === null ? null : Math.round(row.longestM),
    averageM: row.averageM === null ? null : Math.round(row.averageM),
  }));
}
