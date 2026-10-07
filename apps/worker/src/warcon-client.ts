// Warcon (console.warcon.app) is where WDZA's moderators keep the org's ban
// list, and what applies it to the game server. Its JSON API takes an org API
// key as a bearer token. The key can also edit the org's lists, so like the
// RCON token it lives only in the Worker's environment.

const TIMEOUT_MS = 10_000;

/** One entry of a Warcon org's ban list, as GET /api/orgs/{id}/lists/ban/entries returns it. */
export interface WarconBanEntry {
  steamId: string;
  name: string;
  reason: string;
  expiresAt: string | null;
  expired: boolean;
  addedAt: string;
  removedAt: string | null;
}

export interface WarconClient {
  /** The org's current bans: entries that were removed or have expired are left out. */
  fetchBans(): Promise<WarconBanEntry[]>;
}

export function createWarconClient(baseUrl: string, apiKey: string, orgId: string): WarconClient {
  return {
    async fetchBans() {
      const path = `/api/orgs/${orgId}/lists/ban/entries`;
      const response = await fetch(new URL(path, baseUrl), {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`Warcon request to ${path} failed with status ${response.status}`);
      }

      const { entries } = (await response.json()) as { entries: WarconBanEntry[] };
      return entries.filter((entry) => !entry.removedAt && !entry.expired);
    },
  };
}
