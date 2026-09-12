import type { Snapshot } from "@wdza-stats/db";

// Test-only seam: a minimal, valid Snapshot payload with sensible defaults,
// shared by every test that seeds a `latest_snapshots` row.
export function snapshotFixture(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    map: "Sandstorm",
    lighting: "Day",
    alternator: "None",
    experiences: ["TeamDeathmatch"],
    rotation: { nowIndex: 0, entries: [{ map: "Sandstorm" }, { map: "Deadcity" }] },
    factions: [{ name: "Lonestar", color: "#ff0000", score: 10 }],
    players: [
      {
        steamId: "1",
        displayName: "Alice",
        faction: "Lonestar",
        kills: 3,
        deaths: 1,
        cash: 500,
        ping: 40,
      },
    ],
    ...overrides,
  };
}
