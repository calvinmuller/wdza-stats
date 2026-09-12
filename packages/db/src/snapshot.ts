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

export interface Snapshot {
  map: string;
  lighting: string;
  alternator: string;
  experiences: string[];
  rotation: { nowIndex: number };
  factions: SnapshotFaction[];
  players: SnapshotPlayer[];
}
