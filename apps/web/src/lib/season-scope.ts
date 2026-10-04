import { currentSeason, seasons, type Database, type Season } from "@wdza-stats/db";
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

/**
 * The public API's reading of `?season=`: Career when absent, so clients
 * written before Seasons existed see no change, and a 404 Response for a
 * Season that doesn't exist. Callers return the Response as is.
 */
export async function apiSeasonScope(
  db: Database,
  searchParams: URLSearchParams,
): Promise<SeasonScope | Response> {
  const value = searchParams.get("season");
  const scope = await resolveSeasonScope(db, value, "career");
  return scope ?? Response.json({ error: `Unknown season: ${value}` }, { status: 404 });
}

export type SeasonSummary = Pick<Season, "number" | "name" | "startedAt">;

/** How an API response names the Season it was scoped to. */
export function seasonSummary({ number, name, startedAt }: Season): SeasonSummary {
  return { number, name, startedAt };
}
