// Deep import, not the package root: the root barrel pulls in the `postgres`
// driver, and the home page's server cards apply this in the browser too.
import {
  getRotationPreview,
  type Snapshot,
  type SnapshotFaction,
  type SnapshotPlayer,
} from "@wdza-stats/db/snapshot";

/** One online player on a Server's card. */
export interface ServerLivePlayer {
  steamId: string;
  displayName: string;
  /** Their Faction's color, or null if the Snapshot doesn't list that Faction. */
  factionColor: string | null;
  /** From their cached Steam profile; null when unknown. */
  countryCode: string | null;
  kills: number;
  deaths: number;
  cash: number;
  ping: number;
}

/** What a Server's card on the home page says about its latest Snapshot. */
export interface ServerLive {
  map: string;
  lighting: string;
  playerCount: number;
  maxPlayers: number;
  capturedAt: string;
  rotation: { current: string; next: string } | null;
  /** Leader first. */
  factions: SnapshotFaction[];
  /** Most kills first, then fewest deaths. */
  players: ServerLivePlayer[];
}

/**
 * A Server's card fields from a Snapshot, both from the directory's first
 * read and from each update its live stream pushes.
 */
export function serverLiveOf(
  snapshot: Pick<Snapshot, "map" | "lighting" | "playerSlots" | "rotation" | "factions"> & {
    players: (SnapshotPlayer & { countryCode: string | null })[];
  },
  capturedAt: string,
): ServerLive {
  const rotation = getRotationPreview(snapshot.rotation);
  const factionColors = new Map(snapshot.factions.map((faction) => [faction.name, faction.color]));
  return {
    map: snapshot.map,
    lighting: snapshot.lighting,
    playerCount: snapshot.players.length,
    maxPlayers: snapshot.playerSlots.max,
    capturedAt,
    rotation: rotation.current === null ? null : rotation,
    factions: [...snapshot.factions]
      .sort((a, b) => b.score - a.score)
      .map(({ name, color, score }) => ({ name, color, score })),
    players: [...snapshot.players]
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
      .map(({ steamId, displayName, faction, countryCode, kills, deaths, cash, ping }) => ({
        steamId,
        displayName,
        factionColor: factionColors.get(faction) ?? null,
        countryCode,
        kills,
        deaths,
        cash,
        ping,
      })),
  };
}
