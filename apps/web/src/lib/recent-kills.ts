import { kills, type Database } from "@wdza-stats/db";
import { and, asc, count, desc, eq, gt } from "drizzle-orm";

// How many Kills the live page's feed shows and how many a reconnecting
// stream will replay - a small window, never the whole history.
export const RECENT_KILLS_LIMIT = 20;

export interface KillView {
  id: number;
  // The Match open on the Server when this Kill arrived; null if none was.
  matchId: number | null;
  receivedAt: string;
  eventTime: number;
  map: string;
  killerSteamId: string | null;
  killerName: string | null;
  killerFaction: string | null;
  victimSteamId: string;
  victimName: string;
  victimFaction: string | null;
  cause: string | null;
  distanceM: number | null;
  headshot: boolean;
  suicide: boolean;
  tags: string[];
}

export function toKillView(row: typeof kills.$inferSelect): KillView {
  return {
    id: row.id,
    matchId: row.matchRow,
    receivedAt: row.receivedAt.toISOString(),
    eventTime: row.eventTime,
    map: row.map,
    killerSteamId: row.killerSteamId,
    killerName: row.killerName,
    killerFaction: row.killerFaction,
    victimSteamId: row.victimSteamId,
    victimName: row.victimName,
    victimFaction: row.victimFaction,
    cause: row.cause,
    distanceM: row.distanceM,
    headshot: row.headshot,
    suicide: row.suicide,
    tags: row.tags,
  };
}

/**
 * One Server's Kills, oldest first. With `afterId`, only Kills newer than that
 * cursor (the earliest `limit` of them, so a caller catching up gets them in
 * order); without it, the latest `limit` Kills, skipping the newest `offset`.
 */
export async function getRecentKills(
  db: Database,
  serverId: number,
  {
    afterId,
    limit = RECENT_KILLS_LIMIT,
    offset = 0,
  }: { afterId?: number; limit?: number; offset?: number } = {},
): Promise<KillView[]> {
  const rows =
    afterId === undefined
      ? (
          await db
            .select()
            .from(kills)
            .where(eq(kills.serverId, serverId))
            .orderBy(desc(kills.id))
            .limit(limit)
            .offset(offset)
        ).reverse()
      : await db
          .select()
          .from(kills)
          .where(and(eq(kills.serverId, serverId), gt(kills.id, afterId)))
          .orderBy(asc(kills.id))
          .limit(limit);

  return rows.map(toKillView);
}

export async function countKills(db: Database, serverId: number): Promise<number> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(kills)
    .where(eq(kills.serverId, serverId));
  return value;
}
