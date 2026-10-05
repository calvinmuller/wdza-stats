import { matches, playerMatchStats, type Database } from "@wdza-stats/db";
import { and, asc, desc, eq, gt, isNotNull, sql, type SQL } from "drizzle-orm";
import { kdRatio } from "./player-career-stats";
import type { SeasonScope } from "./season-param";

// A player's best single-Match performances (from their PlayerMatchStats),
// shown as Personal bests on the player page.

export interface PersonalBest {
  matchId: number;
  map: string;
  experiences: string[];
  endedAt: string;
  kills: number;
  deaths: number;
  kd: number;
  cash: number;
}

export interface PersonalBests {
  mostKills: PersonalBest | null;
  bestKd: PersonalBest | null;
  mostCash: PersonalBest | null;
}

// Same rule as kdRatio: a deathless Match's K/D is its kill count.
const matchKd = sql`${playerMatchStats.kills}::real / greatest(${playerMatchStats.deaths}, 1)`;

/**
 * The player's closed Matches on one Server with the most kills, the best
 * K/D and the most cash, within the given Season (or across all of them for
 * Career). A best is null when the player never scored that stat at all, so
 * a Match of 0 kills is never anyone's "most kills". Ties go to the earlier
 * Match, the one that set the record.
 */
export async function getPlayerPersonalBests(
  db: Database,
  serverId: number,
  steamId: string,
  scope: SeasonScope,
): Promise<PersonalBests> {
  const inScope: SQL[] = [
    eq(matches.serverId, serverId),
    eq(playerMatchStats.steamId, steamId),
    isNotNull(matches.endedAt),
    ...(scope.kind === "season" ? [eq(matches.seasonId, scope.season.id)] : []),
  ];

  const best = async (scored: SQL, ...order: SQL[]): Promise<PersonalBest | null> => {
    const [row] = await db
      .select({
        matchId: matches.id,
        map: matches.map,
        experiences: matches.experiences,
        endedAt: matches.endedAt,
        kills: playerMatchStats.kills,
        deaths: playerMatchStats.deaths,
        cash: playerMatchStats.cash,
      })
      .from(playerMatchStats)
      .innerJoin(matches, eq(matches.id, playerMatchStats.matchId))
      .where(and(...inScope, scored))
      .orderBy(...order, asc(matches.endedAt), asc(matches.id))
      .limit(1);

    return row
      ? { ...row, endedAt: row.endedAt!.toISOString(), kd: kdRatio(row.kills, row.deaths) }
      : null;
  };

  const [mostKills, bestKd, mostCash] = await Promise.all([
    best(gt(playerMatchStats.kills, 0), desc(playerMatchStats.kills)),
    best(gt(playerMatchStats.kills, 0), desc(matchKd), desc(playerMatchStats.kills)),
    best(gt(playerMatchStats.cash, 0), desc(playerMatchStats.cash)),
  ]);

  return { mostKills, bestKd, mostCash };
}
