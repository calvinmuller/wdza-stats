import { currentSeason, seasons, type Database } from "@wdza-stats/db";
import { eq } from "drizzle-orm";
import type { SeasonScope } from "./season-param";

export type { SeasonScope } from "./season-param";

/**
 * What an absent `season` query value means: pages default to the current
 * Season, the public API to Career (for backward compatibility).
 */
export type SeasonScopeDefault = "current" | "career";

/**
 * Resolves a `season` query value - `current`, `career`, a Season number, or
 * absent - into a SeasonScope. Returns null for a Season that doesn't exist
 * or a value that isn't one of those, so callers answer not-found rather than
 * quietly showing a different Season than the one asked for.
 */
export async function resolveSeasonScope(
  db: Database,
  value: string | null | undefined,
  whenAbsent: SeasonScopeDefault,
): Promise<SeasonScope | null> {
  const wanted = value ?? whenAbsent;
  if (wanted === "career") return { kind: "career" };
  if (wanted === "current") return { kind: "season", season: await currentSeason(db) };

  if (!/^[1-9]\d*$/.test(wanted)) return null;
  const [season] = await db.select().from(seasons).where(eq(seasons.number, Number(wanted))).limit(1);
  return season ? { kind: "season", season } : null;
}
