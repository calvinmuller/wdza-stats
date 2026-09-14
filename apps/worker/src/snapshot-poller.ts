import { latestSnapshots, type Database, type Snapshot, type SnapshotPlayer } from "@wdza-stats/db";
import { eq } from "drizzle-orm";
import { ingestSnapshot } from "./match-tracker";
import type {
  RawPlayersResponse,
  RawStatusResponse,
  RconClient,
} from "./rcon-client";
import { refreshPlaytimeOnJoin, refreshUnseenSteamProfiles } from "./steam-profile-refresh";
import type { SteamClient } from "./steam-client";

/** Steam enrichment is optional: omit it (e.g. no STEAM_API_KEY configured) and polling runs exactly as before. */
export interface SteamRefreshConfig {
  client: SteamClient;
  appId: number;
}

/**
 * steamIds present in `currentPlayers` but not in `previousPlayers` - a
 * player who just joined the server between the last poll and this one.
 * When there's no previous roster to compare against (the Worker's first
 * poll since starting), every currently-online player counts as joined:
 * from this process's perspective, it's the first time it's seeing any of
 * them.
 */
export function newlyJoinedSteamIds(
  previousPlayers: SnapshotPlayer[] | undefined,
  currentPlayers: SnapshotPlayer[],
): string[] {
  if (!previousPlayers) {
    return currentPlayers.map((player) => player.steamId);
  }
  const previousSteamIds = new Set(previousPlayers.map((player) => player.steamId));
  return currentPlayers
    .filter((player) => !previousSteamIds.has(player.steamId))
    .map((player) => player.steamId);
}

function mergeSnapshot(
  status: RawStatusResponse,
  players: RawPlayersResponse,
): Snapshot {
  return {
    map: status.map,
    lighting: status.lighting,
    alternator: status.alternator,
    experiences: status.experiences,
    rotation: {
      nowIndex: status.rotation.nowIndex,
      entries: (status.rotation.entries ?? []).map((entry) => ({ map: entry.map })),
    },
    factions: status.factionScores.map((faction) => ({
      name: faction.name,
      color: faction.colorHex,
      score: faction.score,
    })),
    players: players.players.map((player) => ({
      steamId: player.steamId,
      displayName: player.name,
      faction: player.faction,
      kills: player.kills,
      deaths: player.deaths,
      cash: player.cash,
      ping: player.pingMs,
    })),
    playerSlots: { current: status.players.current, max: status.players.max },
  };
}

/**
 * Polls both RCON endpoints once and ingests the merged Snapshot: overwrites
 * the Server's latest-Snapshot row and runs match-boundary detection (see
 * match-tracker.ts). Throws on failure so callers can decide how to handle
 * it.
 *
 * When `steamConfig` is given, also refreshes SteamProfile data for any
 * steamId in this poll's live roster that isn't cached yet - deliberately
 * on every poll rather than gated by Match close, so a new player's avatar
 * shows up within one ~15s poll cycle of joining instead of waiting for
 * their Match to end (see docs/adr/0002 and steam-profile-refresh.ts) - and
 * re-fetches playtime for anyone who just joined the roster since the last
 * poll (see newlyJoinedSteamIds/refreshPlaytimeOnJoin below), so playtime
 * tracks their actual total across sessions instead of being frozen at
 * first-sighting. Neither refresh throws out of here: a Steam outage must
 * never take down snapshot polling, which is why they aren't folded into
 * the try/catch below - they have their own.
 */
export async function pollAndPersistSnapshot(
  db: Database,
  client: RconClient,
  serverId: number,
  steamConfig?: SteamRefreshConfig,
): Promise<void> {
  const status = await client.fetchStatus();
  const players = await client.fetchPlayers();
  const snapshot = mergeSnapshot(status, players);
  const capturedAt = new Date();

  // One line per poll: a successful ~15s poll otherwise produces no output
  // at all unless a Match boundary or Steam refresh happens to occur, which
  // made the worker look idle/stuck during ordinary quiet stretches.
  console.log(`[worker] poll: ${snapshot.players.length} player(s) online, map=${snapshot.map}`);

  // Read before ingestSnapshot overwrites this Server's latestSnapshots row,
  // so "joined" can be computed against the roster as it stood one poll ago.
  const [previousRow] = await db
    .select({ payload: latestSnapshots.payload })
    .from(latestSnapshots)
    .where(eq(latestSnapshots.serverId, serverId))
    .limit(1);

  await ingestSnapshot(db, serverId, snapshot, capturedAt);

  if (steamConfig) {
    const joinedSteamIds = newlyJoinedSteamIds(previousRow?.payload.players, snapshot.players);

    // Runs before refreshUnseenSteamProfiles: a steamId with no cached row
    // yet is skipped here (refreshPlaytimeOnJoin only touches existing
    // rows) and picked up by refreshUnseenSteamProfiles just below instead,
    // which fetches playtime as part of creating that row - so a brand-new
    // player's join doesn't trigger two playtime fetches for the same poll.
    try {
      await refreshPlaytimeOnJoin(db, steamConfig.client, steamConfig.appId, joinedSteamIds);
    } catch (error) {
      console.error(
        `[worker] Steam playtime refresh failed for server ${serverId}:`,
        error,
      );
    }

    try {
      await refreshUnseenSteamProfiles(
        db,
        steamConfig.client,
        steamConfig.appId,
        snapshot.players.map((player) => player.steamId),
      );
    } catch (error) {
      console.error(
        `[worker] Steam profile refresh failed for server ${serverId}:`,
        error,
      );
    }
  }
}

/** Polls and persists once, logging and swallowing failures instead of crashing the Worker. */
export async function pollOnce(
  db: Database,
  client: RconClient,
  serverId: number,
  steamConfig?: SteamRefreshConfig,
): Promise<void> {
  try {
    await pollAndPersistSnapshot(db, client, serverId, steamConfig);
  } catch (error) {
    console.error(
      `[worker] snapshot poll failed for server ${serverId}:`,
      error,
    );
  }
}

export function startSnapshotPolling(
  db: Database,
  client: RconClient,
  serverId: number,
  intervalMs: number,
  steamConfig?: SteamRefreshConfig,
): NodeJS.Timeout {
  void pollOnce(db, client, serverId, steamConfig);
  return setInterval(() => {
    void pollOnce(db, client, serverId, steamConfig);
  }, intervalMs);
}
