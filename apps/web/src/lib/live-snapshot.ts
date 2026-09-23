import {
  latestSnapshots,
  levelForXp,
  levelThresholds,
  playerCareerStats,
  servers,
  type Database,
  type Snapshot,
  type SnapshotPlayer,
} from "@wdza-stats/db";
import { and, eq, inArray } from "drizzle-orm";
import { getCashHistory, type CashHistoryPoint } from "./cash-history";
import { getActiveChallenges, type ActiveChallengeView } from "./active-challenges";
import { getActiveKickVote } from "./kick-vote";
import { getRecentNotifications, type RecentNotificationView } from "./recent-notifications";
import { getAvatarUrlsBySteamId } from "./steam-profile-lookup";

export interface LiveSnapshotPlayer extends SnapshotPlayer {
  avatarUrl: string | null;
  level: number | null;
}

// Dates as ISO strings, like capturedAt below - this view is shared as-is
// between the server-rendered page and its /api/live-snapshot poll, and a
// Date only survives the first of those two round trips.
export interface LiveKickVoteView {
  id: number;
  targetName: string;
  reason: string;
  endsAt: string;
}

export interface LiveSnapshotView {
  serverId: number;
  serverName: string;
  capturedAt: string;
  snapshot: Omit<Snapshot, "players"> & { players: LiveSnapshotPlayer[] };
  activeChallenges: ActiveChallengeView[];
  recentNotifications: RecentNotificationView[];
  cashHistory: CashHistoryPoint[];
  activeKickVote: LiveKickVoteView | null;
}

// Level per online player, derived from career XP (the Progression
// Engine's source of truth). Players with no PlayerCareerStat yet (never in
// a closed Match) get no entry.
async function getLevelsBySteamId(
  db: Database,
  serverId: number,
  steamIds: string[],
): Promise<Map<string, number>> {
  if (steamIds.length === 0) {
    return new Map();
  }

  const [xpRows, thresholds] = await Promise.all([
    db
      .select({ steamId: playerCareerStats.steamId, xp: playerCareerStats.xp })
      .from(playerCareerStats)
      .where(
        and(
          eq(playerCareerStats.serverId, serverId),
          inArray(playerCareerStats.steamId, steamIds),
        ),
      ),
    db.select().from(levelThresholds),
  ]);

  return new Map(xpRows.map((row) => [row.steamId, levelForXp(row.xp, thresholds)]));
}

/**
 * Reads the given Server's latest Snapshot from Postgres, enriching each
 * online player with their cached Steam avatar - the same batched
 * steamId-to-avatar lookup used by the leaderboard/search/match-history
 * views (getAvatarUrlsBySteamId), since a Snapshot's players come from the
 * RCON payload and carry no avatar of their own. Returns null when the
 * Server isn't seeded, or hasn't been polled by the Worker yet.
 */
export async function getLiveSnapshot(
  db: Database,
  baseUrl: string,
): Promise<LiveSnapshotView | null> {
  const [row] = await db
    .select({
      serverId: servers.id,
      serverName: servers.name,
      capturedAt: latestSnapshots.capturedAt,
      payload: latestSnapshots.payload,
    })
    .from(servers)
    .innerJoin(latestSnapshots, eq(latestSnapshots.serverId, servers.id))
    .where(eq(servers.baseUrl, baseUrl))
    .limit(1);

  if (!row) {
    return null;
  }

  const steamIds = row.payload.players.map((player) => player.steamId);
  const [avatarUrls, levels, activeChallenges, recentNotifications, cashHistory, activeKickVote] = await Promise.all([
    getAvatarUrlsBySteamId(db, steamIds),
    getLevelsBySteamId(db, row.serverId, steamIds),
    getActiveChallenges(db, row.serverId, row.capturedAt),
    getRecentNotifications(db, row.serverId),
    getCashHistory(db, row.serverId),
    getActiveKickVote(db, row.serverId),
  ]);

  return {
    serverId: row.serverId,
    serverName: row.serverName,
    capturedAt: row.capturedAt.toISOString(),
    snapshot: {
      ...row.payload,
      players: row.payload.players.map((player) => ({
        ...player,
        avatarUrl: avatarUrls.get(player.steamId) ?? null,
        level: levels.get(player.steamId) ?? null,
      })),
    },
    activeChallenges,
    recentNotifications,
    cashHistory,
    activeKickVote: activeKickVote
      ? {
          id: activeKickVote.id,
          targetName: activeKickVote.targetName,
          reason: activeKickVote.reason,
          endsAt: activeKickVote.endsAt.toISOString(),
        }
      : null,
  };
}

/**
 * Maps each Faction name to its color, read from the Server's latest
 * Snapshot. Faction colors aren't stored anywhere durable - a closed Match
 * only remembers Faction names - so this is the only source for coloring
 * historical Factions too, and a Faction absent from the current lineup
 * (renamed, removed) simply won't have an entry.
 */
export async function getFactionColors(
  db: Database,
  serverId: number,
): Promise<Map<string, string>> {
  const [row] = await db
    .select({ payload: latestSnapshots.payload })
    .from(latestSnapshots)
    .where(eq(latestSnapshots.serverId, serverId))
    .limit(1);

  if (!row) {
    return new Map();
  }

  return new Map(row.payload.factions.map((faction) => [faction.name, faction.color]));
}

/**
 * Maps each currently-online player's steamId to their Faction's color,
 * read from the Server's latest Snapshot. PlayerCareerStat has no Faction
 * column of its own (Faction is per-Match and can change match to match),
 * so this is the only signal available for coloring a career-stats row -
 * players who aren't currently online get none.
 */
export async function getOnlineFactionColors(
  db: Database,
  serverId: number,
): Promise<Map<string, string>> {
  const [row] = await db
    .select({ payload: latestSnapshots.payload })
    .from(latestSnapshots)
    .where(eq(latestSnapshots.serverId, serverId))
    .limit(1);

  if (!row) {
    return new Map();
  }

  const colorByFaction = new Map(
    row.payload.factions.map((faction) => [faction.name, faction.color]),
  );

  const colorBySteamId = new Map<string, string>();
  for (const player of row.payload.players) {
    const color = colorByFaction.get(player.faction);
    if (color) {
      colorBySteamId.set(player.steamId, color);
    }
  }
  return colorBySteamId;
}
