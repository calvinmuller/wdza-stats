// Raw shapes of the RCON API's two read endpoints. Only these two endpoints
// are ever called - see CONTEXT.md and spec.md for why no write endpoint is used.

export interface RawStatusResponse {
  map: string;
  lighting: string;
  alternator: string;
  rotation: { nowIndex: number };
  experiences: string[];
  factions: Array<{ name: string; color: string; score: number }>;
}

export interface RawPlayersResponse {
  players: Array<{
    steamId: string;
    displayName: string;
    faction: string;
    kills: number;
    deaths: number;
    cash: number;
    ping: number;
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
