// Snapshot: the merged status+players payload captured from one poll of a
// Server's RCON API. See CONTEXT.md.

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
