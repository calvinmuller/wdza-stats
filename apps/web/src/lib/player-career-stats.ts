export interface PlayerCareerView {
  steamId: string;
  displayName: string;
  kills: number;
  deaths: number;
  kd: number;
  cash: number;
  matchesPlayed: number;
  factionColor: string | null;
  avatarUrl: string | null;
  playtimeMinutes: number | null;
}

interface PlayerCareerStatRow {
  steamId: string;
  displayName: string;
  kills: number;
  deaths: number;
  cash: number;
  matchesPlayed: number;
}

// A player with no deaths yet has an undefined kills/0 ratio - showing their
// kill count instead (rather than Infinity or NaN) matches how most
// leaderboards handle a "perfect" record.
export function kdRatio(kills: number, deaths: number): number {
  return deaths === 0 ? kills : kills / deaths;
}

export function toPlayerCareerView(
  row: PlayerCareerStatRow,
  factionColors: Map<string, string>,
  avatarUrls: Map<string, string>,
  playtimeMinutes: Map<string, number> = new Map(),
): PlayerCareerView {
  return {
    steamId: row.steamId,
    displayName: row.displayName,
    kills: row.kills,
    deaths: row.deaths,
    kd: kdRatio(row.kills, row.deaths),
    cash: row.cash,
    matchesPlayed: row.matchesPlayed,
    factionColor: factionColors.get(row.steamId) ?? null,
    avatarUrl: avatarUrls.get(row.steamId) ?? null,
    playtimeMinutes: playtimeMinutes.get(row.steamId) ?? null,
  };
}
