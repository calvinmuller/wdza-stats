import type { Season } from "@wdza-stats/db";
import { seasonLabel, type SeasonScope } from "./season-param";

// Client-safe helpers for the span of Kills a page counts: a Window (see
// CONTEXT.md), the current Season, or all time. Type-only imports from
// @wdza-stats/db, like season-param.ts. Resolving a query value against the
// database is kill-scope-resolve.ts's job.

/** The two Windows the weapon leaderboard offers, in days. */
export const WINDOW_DAYS = [7, 30] as const;
export type WindowDays = (typeof WINDOW_DAYS)[number];

export type KillWindow = { kind: "window"; days: WindowDays };

/**
 * Which Kills a page counts: those delivered inside a rolling Window, those
 * of one Season's Matches, or every Kill the feed has ever delivered (the
 * SeasonScope's "career", shown as "All time" since Kills have no career).
 */
export type KillScope = KillWindow | SeasonScope;

/** The `window` query values, in picker order. */
export const KILL_SCOPE_PARAMS = ["7d", "30d", "season", "all"] as const;
export type KillScopeParam = (typeof KILL_SCOPE_PARAMS)[number];

export function isKillScopeParam(value: string): value is KillScopeParam {
  return (KILL_SCOPE_PARAMS as readonly string[]).includes(value);
}

/** The `window` query value that selects this scope, for links. */
export function killScopeParam(scope: KillScope): KillScopeParam {
  switch (scope.kind) {
    case "window":
      return `${scope.days}d`;
    case "season":
      return "season";
    case "career":
      return "all";
  }
}

/** The picker label for a scope: "Last 7 days", "Season 2 · Autumn", "All time". */
export function killScopeLabel(scope: KillScope): string {
  switch (scope.kind) {
    case "window":
      return `Last ${scope.days} days`;
    case "season":
      return seasonLabel(scope.season);
    case "career":
      return "All time";
  }
}

/**
 * How a sentence names the scope: "Nobody got a kill with the AK74 in the
 * last 7 days." / "... in Season 2." / "... yet." for all time.
 */
export function killScopePhrase(scope: KillScope): string {
  switch (scope.kind) {
    case "window":
      return `in the last ${scope.days} days`;
    case "season":
      return `in Season ${scope.season.number}`;
    case "career":
      return "yet";
  }
}

/** The scope a `window` query value names, given the current Season. */
export function killScopeFor(param: KillScopeParam, current: Season): KillScope {
  switch (param) {
    case "7d":
      return { kind: "window", days: 7 };
    case "30d":
      return { kind: "window", days: 30 };
    case "season":
      return { kind: "season", season: current };
    case "all":
      return { kind: "career" };
  }
}
