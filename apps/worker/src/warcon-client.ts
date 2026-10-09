// Warcon (console.warcon.app) is where WDZA's moderators keep the org's ban
// list and reserved-slot list, and what applies them to the game server. Its
// JSON API takes an org API key as a bearer token. The key can also edit the
// org's lists, so like the RCON token it lives only in the Worker's environment.

const TIMEOUT_MS = 10_000;

/** One entry of a Warcon org list, as GET /api/orgs/{id}/lists/{kind}/entries returns it. */
export interface WarconListEntry {
  steamId: string;
  /** The last name Warcon saw for the steamId, or null if it never saw one. */
  name: string | null;
  reason: string;
  expiresAt: string | null;
  expired: boolean;
  addedAt: string;
  removedAt: string | null;
}

export interface WarconClient {
  /** The org's current bans: entries that were removed or have expired are left out. */
  fetchBans(): Promise<WarconListEntry[]>;
  /** The org's current reserved slots, including the ones Warcon hands its own members. */
  fetchReservedSlots(): Promise<WarconListEntry[]>;
}

export function createWarconClient(baseUrl: string, apiKey: string, orgId: string): WarconClient {
  async function fetchList(kind: "ban" | "reserve"): Promise<WarconListEntry[]> {
    const path = `/api/orgs/${orgId}/lists/${kind}/entries`;
    const response = await fetch(new URL(path, baseUrl), {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Warcon request to ${path} failed with status ${response.status}`);
    }

    const { entries } = (await response.json()) as { entries: WarconListEntry[] };
    return entries.filter((entry) => !entry.removedAt && !entry.expired);
  }

  return {
    fetchBans: () => fetchList("ban"),
    fetchReservedSlots: () => fetchList("reserve"),
  };
}
