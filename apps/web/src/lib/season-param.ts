import type { Season } from "@wdza-stats/db";

// Client-safe Season helpers: type-only imports from @wdza-stats/db, so a
// "use client" component (the Season picker inside a client table, say) can
// use them without pulling the database package into the browser bundle.
// Resolving a query value against the database is season-scope.ts's job.

/**
 * Which stats a page or API response shows: one Season's PlayerSeasonStats,
 * or Career (PlayerCareerStat, the total over every Season).
 */
export type SeasonScope = { kind: "career" } | { kind: "season"; season: Season };

/**
 * The `season` query value that selects this scope, for links. A Season is
 * linked by number, so a shared link keeps showing that Season after the
 * next one starts.
 */
export function seasonScopeParam(scope: SeasonScope): string {
  return scope.kind === "career" ? "career" : String(scope.season.number);
}

export function seasonLabel(season: Pick<Season, "number" | "name">): string {
  return season.name ? `Season ${season.number} · ${season.name}` : `Season ${season.number}`;
}
