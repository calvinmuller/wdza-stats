import { matches, matchSnapshots, type Database } from "@wdza-stats/db";
import { and, asc, desc, eq, isNull } from "drizzle-orm";

// Cap on points sent to the browser - a long Match at the 15s poll cadence
// would otherwise ship thousands of points for a chart ~1000px wide.
const MAX_POINTS = 300;

export interface CashHistoryPoint {
  capturedAt: string;
  total: number;
  byFaction: Record<string, number>;
}

/**
 * Cash held by connected players over the Server's currently-open Match,
 * one point per stored Snapshot: the total plus a per-Faction sum. Empty
 * when no Match is open.
 */
export async function getCashHistory(
  db: Database,
  serverId: number,
): Promise<CashHistoryPoint[]> {
  const [match] = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(eq(matches.serverId, serverId), isNull(matches.endedAt)))
    .orderBy(desc(matches.startedAt))
    .limit(1);

  if (!match) {
    return [];
  }

  const rows = await db
    .select({ capturedAt: matchSnapshots.capturedAt, payload: matchSnapshots.payload })
    .from(matchSnapshots)
    .where(eq(matchSnapshots.matchId, match.id))
    .orderBy(asc(matchSnapshots.capturedAt));

  const step = Math.max(1, Math.ceil(rows.length / MAX_POINTS));

  return rows
    .filter((_, index) => index % step === 0 || index === rows.length - 1)
    .map((row) => {
      const byFaction: Record<string, number> = {};
      let total = 0;
      for (const player of row.payload.players) {
        byFaction[player.faction] = (byFaction[player.faction] ?? 0) + player.cash;
        total += player.cash;
      }
      return { capturedAt: row.capturedAt.toISOString(), total, byFaction };
    });
}
