import type {
  RawPlayersResponse,
  RawStatusResponse,
  RconClient,
} from "./rcon-client";

export function statusFixture(
  overrides: Partial<RawStatusResponse> = {},
): RawStatusResponse {
  return {
    map: "Sandstorm",
    lighting: "Day",
    alternator: "None",
    rotation: { nowIndex: 0, entries: [{ map: "Sandstorm" }, { map: "Deadcity" }] },
    experiences: ["TeamDeathmatch"],
    factionScores: [
      { name: "Lonestar", colorHex: "#ff0000", score: 10 },
      { name: "Valkyra", colorHex: "#0000ff", score: 8 },
    ],
    ...overrides,
  };
}

export function playersFixture(
  players: RawPlayersResponse["players"] = [],
): RawPlayersResponse {
  return { players };
}

// Test-only seam: a fake RCON client fed a scripted sequence of raw
// responses, so ingestion runs for real without hitting the network.
export function scriptedRconClient(
  script: Array<{ status: RawStatusResponse; players: RawPlayersResponse }>,
): RconClient {
  let index = 0;
  return {
    async fetchStatus() {
      return script[index].status;
    },
    async fetchPlayers() {
      const entry = script[index];
      index = Math.min(index + 1, script.length - 1);
      return entry.players;
    },
  };
}
