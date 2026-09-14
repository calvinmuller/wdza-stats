import type { Database, Snapshot } from "@wdza-stats/db";
import { ingestSnapshot } from "./match-tracker";
import type {
  RawPlayersResponse,
  RawStatusResponse,
  RconClient,
} from "./rcon-client";
import { refreshUnseenSteamProfiles } from "./steam-profile-refresh";
import type { SteamClient } from "./steam-client";

/** Steam enrichment is optional: omit it (e.g. no STEAM_API_KEY configured) and polling runs exactly as before. */
export interface SteamRefreshConfig {
  client: SteamClient;
  appId: number;
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
 * their Match to end (see docs/adr/0002 and steam-profile-refresh.ts). This
 * never throws out of here: a Steam outage must never take down snapshot
 * polling, which is why it isn't folded into the try/catch below - it has
 * its own.
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

  await ingestSnapshot(db, serverId, snapshot, capturedAt);

  if (steamConfig) {
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
