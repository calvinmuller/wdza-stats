import {
  gameEvents,
  latestSnapshots,
  matches,
  playerCareerStats,
  playerSeasonStats,
  seasons,
  steamProfiles,
  type Database,
} from "@wdza-stats/db";
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { getBannedSteamIds } from "./banned-players";
import type { SeasonScope } from "./season-param";
import { getServerByBaseUrl } from "./server-lookup";

// Dates as ISO strings, so the view can be handed to a client component as-is.
export interface MostActivePlayerRow {
  steamId: string;
  displayName: string;
  playtimeSeconds: number;
  sessions: number;
  kills: number;
  deaths: number;
  online: boolean;
  lastSeenAt: string;
}

export const MOST_ACTIVE_PLAYERS_LIMIT = 25;

// Consecutive Matches normally sit one poll apart. A longer gap between one
// Match's end and the next one's start means the Worker wasn't polling (see
// match-tracker.ts: a stale Match is closed at its last-known-good Snapshot,
// the next opens at the first Snapshot after the gap).
const POLLING_GAP_MS = 2 * 60 * 1000;

/**
 * Ranks a Server's players by time spent on it, most first. A session runs
 * from a PlayerJoined GameEvent to that player's next join/leave GameEvent
 * (normally their PlayerLeft); one still open runs to the latest Snapshot,
 * since the player is still online. A PlayerLeft with no PlayerJoined before
 * it opens nothing. Join/leave GameEvents ignore Match boundaries, so a
 * session can span several Matches.
 *
 * Nobody was seen while the Worker wasn't polling, so time inside a polling
 * gap (see POLLING_GAP_MS) is never playtime, and a session whose PlayerLeft
 * only arrived once polling resumed was last seen when the gap began.
 *
 * Career counts every session. A Season counts only the part of each session
 * between its start and the next Season's start, so a session that straddles
 * a Season change is split between the two. Kills and deaths are the scope's
 * PlayerCareerStat or PlayerSeasonStat totals. Last seen is when the player's
 * latest session ended, whatever the scope. Returns an empty list when the
 * Server isn't seeded.
 */
export async function getMostActivePlayers(
  db: Database,
  baseUrl: string,
  scope: SeasonScope = { kind: "career" },
  limit = MOST_ACTIVE_PLAYERS_LIMIT,
): Promise<MostActivePlayerRow[]> {
  const server = await getServerByBaseUrl(db, baseUrl);

  if (!server) {
    return [];
  }

  const [bannedSteamIds, [latest], bounds, gaps] = await Promise.all([
    getBannedSteamIds(db),
    db
      .select({ capturedAt: latestSnapshots.capturedAt, payload: latestSnapshots.payload })
      .from(latestSnapshots)
      .where(eq(latestSnapshots.serverId, server.id)),
    seasonBounds(db, scope),
    pollingGaps(db, server.id),
  ]);

  const now = (latest?.capturedAt ?? new Date()).toISOString();

  const presence = db.$with("presence").as(
    db
      .select({
        steamId: gameEvents.steamId,
        type: gameEvents.type,
        at: gameEvents.timestamp,
        nextAt: sql`lead(${gameEvents.timestamp}) over (partition by ${gameEvents.steamId} order by ${gameEvents.timestamp}, ${gameEvents.id})`.as(
          "next_at",
        ),
      })
      .from(gameEvents)
      .where(
        and(
          eq(gameEvents.serverId, server.id),
          inArray(gameEvents.type, ["PlayerJoined", "PlayerLeft"]),
          notInArray(gameEvents.steamId, bannedSteamIds),
        ),
      ),
  );

  const endedAt = sql`coalesce(${presence.nextAt}, ${now}::timestamptz)`;
  const from = bounds.from ? sql`greatest(${presence.at}, ${bounds.from}::timestamptz)` : sql`${presence.at}`;
  const to = bounds.to ? sql`least(${endedAt}, ${bounds.to}::timestamptz)` : endedAt;
  const inScope = sql`${to} > ${from}`;
  // The polling gaps as (gap_from, gap_to) rows, for the subqueries below.
  const gapRows = sql`unnest(${timestampArray(gaps.map((gap) => gap.from))}::timestamptz[], ${timestampArray(
    gaps.map((gap) => gap.to),
  )}::timestamptz[]) as gap(gap_from, gap_to)`;
  const gapSeconds = sql`(select coalesce(sum(greatest(0, extract(epoch from least(${to}, gap_to) - greatest(${from}, gap_from)))), 0) from ${gapRows})`;
  const playtimeSeconds = sql<number>`coalesce(sum(extract(epoch from ${to} - ${from}) - ${gapSeconds}) filter (where ${inScope}), 0)`.mapWith(
    Number,
  );
  const sessions = sql<number>`count(*) filter (where ${inScope})`.mapWith(Number);
  const lastSeenAt = sql<Date>`max(coalesce((select gap_from from ${gapRows} where ${endedAt} > gap_from and ${endedAt} <= gap_to limit 1), ${endedAt}))`.mapWith(
    gameEvents.timestamp,
  );

  const ranked = await db
    .with(presence)
    .select({
      steamId: presence.steamId,
      playtimeSeconds,
      sessions,
      lastSeenAt,
    })
    .from(presence)
    .where(eq(presence.type, "PlayerJoined"))
    .groupBy(presence.steamId)
    .having(sql`count(*) filter (where ${inScope}) > 0`)
    .orderBy(desc(playtimeSeconds), presence.steamId)
    .limit(limit);

  const steamIds = ranked.flatMap((row) => (row.steamId ? [row.steamId] : []));
  if (steamIds.length === 0) {
    return [];
  }

  const [statRows, careerNames, steamNames] = await Promise.all([
    scope.kind === "career"
      ? db
          .select({
            steamId: playerCareerStats.steamId,
            kills: playerCareerStats.kills,
            deaths: playerCareerStats.deaths,
          })
          .from(playerCareerStats)
          .where(and(eq(playerCareerStats.serverId, server.id), inArray(playerCareerStats.steamId, steamIds)))
      : db
          .select({
            steamId: playerSeasonStats.steamId,
            kills: playerSeasonStats.kills,
            deaths: playerSeasonStats.deaths,
          })
          .from(playerSeasonStats)
          .where(
            and(
              eq(playerSeasonStats.seasonId, scope.season.id),
              eq(playerSeasonStats.serverId, server.id),
              inArray(playerSeasonStats.steamId, steamIds),
            ),
          ),
    db
      .select({ steamId: playerCareerStats.steamId, name: playerCareerStats.displayName })
      .from(playerCareerStats)
      .where(and(eq(playerCareerStats.serverId, server.id), inArray(playerCareerStats.steamId, steamIds))),
    db
      .select({ steamId: steamProfiles.steamId, name: steamProfiles.personaName })
      .from(steamProfiles)
      .where(inArray(steamProfiles.steamId, steamIds)),
  ]);

  const statsBySteamId = new Map(statRows.map((row) => [row.steamId, row]));
  const onlinePlayers = new Map(
    (latest?.payload.players ?? []).map((player) => [player.steamId, player.displayName]),
  );
  // A player who hasn't finished a Match yet has no PlayerCareerStat, and one
  // whose Steam profile hasn't been fetched has no SteamProfile - fall back
  // through whichever name exists.
  const namesBySteamId = new Map<string, string>();
  for (const row of [...steamNames, ...careerNames]) {
    if (row.name) namesBySteamId.set(row.steamId, row.name);
  }

  return ranked.flatMap((row) => {
    if (!row.steamId) return [];
    const stats = statsBySteamId.get(row.steamId);
    const online = onlinePlayers.has(row.steamId);
    return [
      {
        steamId: row.steamId,
        displayName:
          namesBySteamId.get(row.steamId) ?? onlinePlayers.get(row.steamId) ?? row.steamId,
        playtimeSeconds: row.playtimeSeconds,
        sessions: row.sessions,
        kills: stats?.kills ?? 0,
        deaths: stats?.deaths ?? 0,
        online,
        lastSeenAt: row.lastSeenAt.toISOString(),
      },
    ];
  });
}

/**
 * The wall-clock span a scope covers, as ISO strings: a Season runs from its
 * own start to the next Season's (open-ended for the current one); Career has
 * no bounds.
 */
async function seasonBounds(
  db: Database,
  scope: SeasonScope,
): Promise<{ from: string | null; to: string | null }> {
  if (scope.kind === "career") {
    return { from: null, to: null };
  }

  const [next] = await db
    .select({ startedAt: seasons.startedAt })
    .from(seasons)
    .where(eq(seasons.number, scope.season.number + 1));

  return {
    from: scope.season.startedAt.toISOString(),
    to: next?.startedAt.toISOString() ?? null,
  };
}

/**
 * The Server's polling gaps, oldest first: each a span between one Match's
 * end and the next Match's start longer than POLLING_GAP_MS.
 */
async function pollingGaps(db: Database, serverId: number): Promise<{ from: Date; to: Date }[]> {
  const rows = await db
    .select({ startedAt: matches.startedAt, endedAt: matches.endedAt })
    .from(matches)
    .where(eq(matches.serverId, serverId))
    .orderBy(matches.startedAt);

  return rows.flatMap((match, index) => {
    const next = rows[index + 1];
    if (!match.endedAt || !next || next.startedAt.getTime() - match.endedAt.getTime() <= POLLING_GAP_MS) {
      return [];
    }
    return [{ from: match.endedAt, to: next.startedAt }];
  });
}

/** A Postgres array literal of timestamps, e.g. {2030-01-01T00:00:00.000Z}. */
function timestampArray(dates: Date[]): string {
  return `{${dates.map((date) => date.toISOString()).join(",")}}`;
}
