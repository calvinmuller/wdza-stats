import {
  latestSnapshots,
  servers,
  type Database,
  type Snapshot,
  type SnapshotPlayer,
} from "@wdza-stats/db";
import { eq } from "drizzle-orm";
import { getActiveChallenges, type ActiveChallengeView } from "./active-challenges";
import { getRecentNotifications, type RecentNotificationView } from "./recent-notifications";
import { getAvatarUrlsBySteamId } from "./steam-profile-lookup";

export interface LiveSnapshotPlayer extends SnapshotPlayer {
  avatarUrl: string | null;
}

export interface LiveSnapshotView {
  serverName: string;
  capturedAt: string;
  snapshot: Omit<Snapshot, "players"> & { players: LiveSnapshotPlayer[] };
  activeChallenges: ActiveChallengeView[];
  recentNotifications: RecentNotificationView[];
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

  const [avatarUrls, activeChallenges, recentNotifications] = await Promise.all([
    getAvatarUrlsBySteamId(
      db,
      row.payload.players.map((player) => player.steamId),
    ),
    getActiveChallenges(db, row.serverId, row.capturedAt),
    getRecentNotifications(db, row.serverId),
  ]);

  return {
    serverName: row.serverName,
    capturedAt: row.capturedAt.toISOString(),
    snapshot: {
      ...row.payload,
      players: row.payload.players.map((player) => ({
        ...player,
        avatarUrl: avatarUrls.get(player.steamId) ?? null,
      })),
    },
    activeChallenges,
    recentNotifications,
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
