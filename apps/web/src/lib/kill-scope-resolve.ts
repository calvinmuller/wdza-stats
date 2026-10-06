import { currentSeason, type Database } from "@wdza-stats/db";
import { isKillScopeParam, killScopeFor, type KillScope } from "./kill-scope";

/**
 * Resolves a `window` query value - `7d`, `30d`, `season`, `all`, or absent
 * (the last 7 days) - into a KillScope. Returns null for anything else, so
 * callers answer not-found rather than quietly showing a different span than
 * the one asked for. The Season option is always the current Season.
 */
export async function resolveKillScope(
  db: Database,
  value: string | null | undefined,
): Promise<KillScope | null> {
  const wanted = value ?? "7d";
  if (!isKillScopeParam(wanted)) return null;
  return killScopeFor(wanted, await currentSeason(db));
}
