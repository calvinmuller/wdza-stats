// Snapshot: the merged status+players payload captured from one poll of a
// Server's RCON API. See CONTEXT.md.

// The Worker's own poll cadence (apps/worker/src/index.ts) - shared so any
// consumer of a Snapshot (e.g. the Web app's live-refresh page) can't drift
// out of sync with how often a new one can actually arrive.
export const SNAPSHOT_POLL_INTERVAL_MS = 15_000;

export interface SnapshotFaction {
  name: string;
  color: string;
  score: number;
}

export interface SnapshotPlayer {
  steamId: string;
  displayName: string;
  faction: string;
  kills: number;
  deaths: number;
  cash: number;
  ping: number;
}

export interface RotationEntry {
  map: string;
  // Absent on rows persisted before lighting was captured from /v1/rotation.
  lighting?: string;
}

export interface SnapshotRotation {
  nowIndex: number;
  entries: RotationEntry[];
}

export interface PlayerSlots {
  current: number;
  max: number;
}

export interface Snapshot {
  map: string;
  lighting: string;
  alternator: string;
  experiences: string[];
  rotation: SnapshotRotation;
  factions: SnapshotFaction[];
  players: SnapshotPlayer[];
  playerSlots: PlayerSlots;
}

export type RotationPreview =
  | { current: string; next: string }
  | { current: null; next: null };

/**
 * Reads the current and next map from a Snapshot's rotation state, wrapping
 * around to the start of the rotation after the last entry. Returns nulls
 * when the rotation has no entries - either not yet captured, or (since
 * Snapshot payloads are stored as untyped jsonb) a row persisted by a Worker
 * build that predates `entries` being added to this shape.
 */
export function getRotationPreview(rotation: SnapshotRotation): RotationPreview {
  const { nowIndex } = rotation;
  const entries = rotation.entries ?? [];
  if (entries.length === 0) {
    return { current: null, next: null };
  }

  return {
    current: entries[nowIndex % entries.length].map,
    next: entries[(nowIndex + 1) % entries.length].map,
  };
}
