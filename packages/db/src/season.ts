import { and, desc, eq, getTableColumns, isNotNull, sql } from "drizzle-orm";
import type { Database } from "./client";
import { matches, playerSeasonStats, seasons } from "./schema";

// Season (see CONTEXT.md): numbered, optionally named, shared by every Server,
// started by hand by an admin. Seasons run back to back, so the current one is
// always the highest-numbered; matches.season_id's database default
// (current_season_id()) reads the same rule, so a Season becomes current for
// the Worker the moment its row commits.

export type Season = typeof seasons.$inferSelect;

/** The Season started or withdrawn, or why it wasn't. */
export type SeasonChangeResult = { ok: true; season: Season } | { ok: false; error: string };

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
): Promise<SeasonChangeResult> {
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

/**
 * Why `current` (the current Season) can't be withdrawn, or null if it can:
 * never Season 1, and never once one of its Matches has closed.
 */
async function withdrawalRefusal(db: Pick<Database, "select">, current: Season): Promise<string | null> {
  if (current.number === 1) return "Season 1 can't be withdrawn.";
  const [closed] = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(eq(matches.seasonId, current.id), isNotNull(matches.endedAt)))
    .limit(1);
  return closed ? `Season ${current.number} can't be withdrawn: a Match in it has already closed.` : null;
}

/** The current Season, if it can still be withdrawn (see withdrawSeason); null otherwise. */
export async function withdrawableSeason(db: Database): Promise<Season | null> {
  const current = await currentSeason(db);
  return (await withdrawalRefusal(db, current)) === null ? current : null;
}

// How each PlayerSeasonStat column folds into the previous Season's: totals
// add up, highestKillStreak takes the greater. Built from the schema, so a
// new total column is folded (added) without anyone remembering to.
const { seasonId: _seasonId, serverId: _serverId, steamId: _steamId, ...seasonStatColumns } =
  getTableColumns(playerSeasonStats);
const FOLD_INTO_EXISTING = Object.fromEntries(
  Object.entries(seasonStatColumns).map(([key, column]) => {
    const incoming = sql.raw(`excluded."${column.name}"`);
    return [key, key === "highestKillStreak" ? sql`GREATEST(${column}, ${incoming})` : sql`${column} + ${incoming}`];
  }),
);

/**
 * Withdraws Season `number`, a just-started Season begun by mistake: the
 * previous Season becomes current again, the withdrawn Season's (open)
 * Matches move back to it, and everything they accrued - season XP, highest
 * KillStreak - is folded into the previous Season's PlayerSeasonStats before
 * the withdrawn Season and its rows are removed. Career totals never change.
 * Only the current Season, and only while withdrawalRefusal allows it.
 * Callers must already have checked the actor is an admin.
 */
export async function withdrawSeason(db: Database, input: { number: number }): Promise<SeasonChangeResult> {
  if (!Number.isInteger(input.number)) return { ok: false, error: "Refresh the page and try again." };

  return db.transaction(async (tx) => {
    // Serialises with starts and other withdrawals, as startNextSeason does.
    // Then, in the order the Worker writes them so neither can deadlock the
    // other: no Match opens, closes, or changes Season, and no season total
    // changes, until this commits. A Match close waiting on these locks reads
    // its Season afresh (closeMatch's UPDATE ... RETURNING), so it credits
    // the previous Season; a Worker write already holding the withdrawn
    // Season's id fails its foreign key once the Season is gone, so that
    // whole poll rolls back and the next poll picks its changes up again -
    // never lost, never counted twice.
    await tx.execute(sql`LOCK TABLE ${seasons} IN SHARE ROW EXCLUSIVE MODE`);
    await tx.execute(sql`LOCK TABLE ${matches} IN SHARE ROW EXCLUSIVE MODE`);
    await tx.execute(sql`LOCK TABLE ${playerSeasonStats} IN EXCLUSIVE MODE`);

    const current = await currentSeason(tx);
    if (input.number !== current.number) {
      return { ok: false, error: `Season ${input.number} isn't the current Season, so it can't be withdrawn.` } as const;
    }
    const refusal = await withdrawalRefusal(tx, current);
    if (refusal) return { ok: false, error: refusal } as const;

    const [previous] = await tx.select().from(seasons).where(eq(seasons.number, current.number - 1));

    await tx.update(matches).set({ seasonId: previous.id }).where(eq(matches.seasonId, current.id));

    const accrued = await tx.select().from(playerSeasonStats).where(eq(playerSeasonStats.seasonId, current.id));
    if (accrued.length > 0) {
      await tx
        .insert(playerSeasonStats)
        .values(accrued.map((row) => ({ ...row, seasonId: previous.id })))
        .onConflictDoUpdate({
          target: [playerSeasonStats.seasonId, playerSeasonStats.serverId, playerSeasonStats.steamId],
          set: FOLD_INTO_EXISTING,
        });
    }
    await tx.delete(playerSeasonStats).where(eq(playerSeasonStats.seasonId, current.id));
    await tx.delete(seasons).where(eq(seasons.id, current.id));

    return { ok: true, season: current } as const;
  });
}
