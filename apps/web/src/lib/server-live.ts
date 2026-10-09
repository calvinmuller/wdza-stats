// Deep import, not the package root: the root barrel pulls in the `postgres`
// driver, and the home page's server cards apply this in the browser too.
import { getRotationPreview, type Snapshot, type SnapshotFaction } from "@wdza-stats/db/snapshot";

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
}

/**
 * A Server's card fields from a Snapshot, both from the directory's first
 * read and from each update its live stream pushes.
 */
export function serverLiveOf(
  snapshot: Pick<Snapshot, "map" | "lighting" | "players" | "playerSlots" | "rotation" | "factions">,
  capturedAt: string,
): ServerLive {
  const rotation = getRotationPreview(snapshot.rotation);
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
  };
}
