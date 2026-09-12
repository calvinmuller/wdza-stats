// Raw shapes of the RCON API's two read endpoints, confirmed against the
// live server. Only these two endpoints are ever called - see CONTEXT.md and
// spec.md for why no write endpoint is used. Field names here are the RCON
// API's own wire format, which differs from our domain Snapshot type (e.g.
// "name"/"pingMs" here map onto "displayName"/"ping" - see mergeSnapshot in
// snapshot-poller.ts).

export interface RawStatusResponse {
  map: string;
  lighting: string;
  alternator: string;
  // `entries` is documented by the RCON API but the live WDZA server doesn't
  // actually send it (same category of gap as the missing matchSeconds/
  // scoreCap fields in docs/adr/0001) - optional here, defaulted in
  // mergeSnapshot (snapshot-poller.ts) rather than assumed present.
  rotation: { nowIndex: number; entries?: Array<{ map: string }> };
  experiences: string[];
  factionScores: Array<{ name: string; colorHex: string; score: number }>;
}

export interface RawPlayersResponse {
  players: Array<{
    steamId: string;
    name: string;
    faction: string;
    kills: number;
    deaths: number;
    cash: number;
    pingMs: number;
  }>;
}

/**
 * Wraps GET /v1/status and GET /v1/players for one Server. This is the only
 * code in the system that calls the RCON API - no write endpoint is exposed.
 */
export interface RconClient {
  fetchStatus(): Promise<RawStatusResponse>;
  fetchPlayers(): Promise<RawPlayersResponse>;
}

export function createRconClient(baseUrl: string, token: string): RconClient {
  async function get<T>(path: string): Promise<T> {
    const response = await fetch(new URL(path, baseUrl), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(
        `RCON request to ${path} failed with status ${response.status}`,
      );
    }

    return (await response.json()) as T;
  }

  return {
    fetchStatus: () => get<RawStatusResponse>("/v1/status"),
    fetchPlayers: () => get<RawPlayersResponse>("/v1/players"),
  };
}
