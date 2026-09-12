import type { Database, Snapshot } from "@wdza-stats/db";
import { ingestSnapshot } from "./match-tracker";
import type {
  RawPlayersResponse,
  RawStatusResponse,
  RconClient,
} from "./rcon-client";

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
  };
}

/**
 * Polls both RCON endpoints once and ingests the merged Snapshot: overwrites
 * the Server's latest-Snapshot row and runs match-boundary detection (see
 * match-tracker.ts). Throws on failure so callers can decide how to handle
 * it.
 */
export async function pollAndPersistSnapshot(
  db: Database,
  client: RconClient,
  serverId: number,
): Promise<void> {
  const status = await client.fetchStatus();
  const players = await client.fetchPlayers();
  const snapshot = mergeSnapshot(status, players);
  const capturedAt = new Date();

  await ingestSnapshot(db, serverId, snapshot, capturedAt);
}

/** Polls and persists once, logging and swallowing failures instead of crashing the Worker. */
export async function pollOnce(
  db: Database,
  client: RconClient,
  serverId: number,
): Promise<void> {
  try {
    await pollAndPersistSnapshot(db, client, serverId);
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
): NodeJS.Timeout {
  void pollOnce(db, client, serverId);
  return setInterval(() => {
    void pollOnce(db, client, serverId);
  }, intervalMs);
}
