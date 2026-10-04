import { desc, sql } from "drizzle-orm";
import type { Database } from "./client";
import { seasons } from "./schema";

// Season (see CONTEXT.md): numbered, optionally named, shared by every Server,
// started by hand by an admin. Seasons run back to back, so the current one is
// always the highest-numbered; matches.season_id's database default
// (current_season_id()) reads the same rule, so a Season becomes current for
// the Worker the moment its row commits.

export type Season = typeof seasons.$inferSelect;

export type StartSeasonResult = { ok: true; season: Season } | { ok: false; error: string };

export const SEASON_NAME_MAX_LENGTH = 60;

export async function currentSeason(db: Pick<Database, "select">): Promise<Season> {
  // Season 1 is created by the migration, so there is always one.
  const [row] = await db.select().from(seasons).orderBy(desc(seasons.number)).limit(1);
  return row;
}

/** Every Season, newest first. */
export async function listSeasons(db: Database): Promise<Season[]> {
  return db.select().from(seasons).orderBy(desc(seasons.number));
}

/**
 * Starts Season `number`, which must be the current Season's number + 1: the
 * caller passes the number the admin confirmed, so if someone else started it
 * first this refuses rather than quietly starting the one after. Callers must
 * already have checked the actor is an admin.
 */
export async function startNextSeason(
  db: Database,
  input: { number: number; name: string },
): Promise<StartSeasonResult> {
  if (!Number.isInteger(input.number)) return { ok: false, error: "Refresh the page and try again." };
  const name = input.name.trim() || null;
  if (name && name.length > SEASON_NAME_MAX_LENGTH) {
    return { ok: false, error: `Keep the name to ${SEASON_NAME_MAX_LENGTH} characters.` };
  }

  return db.transaction(async (tx) => {
    // Serialises starts (the lock conflicts with itself and with inserts)
    // without blocking reads or the Worker's Match inserts, whose foreign key
    // check only takes a weaker lock. Read the current Season only once it's
    // held, so a start that just committed is seen.
    await tx.execute(sql`LOCK TABLE ${seasons} IN SHARE ROW EXCLUSIVE MODE`);
    const current = await currentSeason(tx);
    const next = current.number + 1;
    if (input.number !== next) {
      return {
        ok: false,
        error:
          input.number <= current.number
            ? `Season ${input.number} has already been started. The next one is Season ${next}.`
            : `Season ${input.number} can't be started yet. The next one is Season ${next}.`,
      } as const;
    }
    // startedAt takes the database's clock, like Season 1's and every Match's.
    const [season] = await tx.insert(seasons).values({ number: next, name }).returning();
    return { ok: true, season } as const;
  });
}
