import {
  listenTo,
  steamAchievementSchema,
  VERIFIED_PLAYER_CLAIMED_CHANNEL,
  steamProfiles,
  type Database,
  type SteamAchievementUnlock,
  type SteamProfileStatus,
} from "@wdza-stats/db";
import { eq, inArray } from "drizzle-orm";
import type { SteamClient } from "./steam-client";

// Steam's rate limit is undocumented but community-observed at ~25 req/s
// with a hard burst lock (tightened from ~100 req/s in June 2025), and a
// 429's Retry-After is typically 60-120s. An "error" row is retried on the
// player's next sighting, but not sooner than this cooldown, so a sustained
// Steam outage doesn't get hammered again every ~15s poll.
const ERROR_RETRY_COOLDOWN_MS = 60_000;

async function ensureAchievementSchemaCached(
  db: Database,
  steamClient: SteamClient,
  appId: number,
): Promise<void> {
  const [existing] = await db
    .select({ appId: steamAchievementSchema.appId })
    .from(steamAchievementSchema)
    .where(eq(steamAchievementSchema.appId, appId))
    .limit(1);

  if (existing) {
    return;
  }

  const entries = await steamClient.fetchGameSchema(appId);
  if (entries.length === 0) {
    return;
  }

  await db
    .insert(steamAchievementSchema)
    .values(entries.map((entry) => ({ appId, ...entry })))
    .onConflictDoNothing();
}

async function upsertSteamProfile(
  db: Database,
  row: {
    steamId: string;
    personaName: string | null;
    avatarUrl: string | null;
    countryCode: string | null;
    achievements: SteamAchievementUnlock[];
    playtimeMinutes: number | null;
    status: SteamProfileStatus;
    fetchedAt: Date;
  },
): Promise<void> {
  await db
    .insert(steamProfiles)
    .values(row)
    .onConflictDoUpdate({
      target: [steamProfiles.steamId],
      set: {
        personaName: row.personaName,
        avatarUrl: row.avatarUrl,
        countryCode: row.countryCode,
        achievements: row.achievements,
        playtimeMinutes: row.playtimeMinutes,
        status: row.status,
        fetchedAt: row.fetchedAt,
      },
    });
}

/**
 * Fetches and caches Steam profile data (persona name, avatar, WARDOGS
 * achievement unlocks, WARDOGS playtime) for any steamId in `steamIds`
 * that has no cached
 * SteamProfile row yet, or whose last attempt errored more than
 * ERROR_RETRY_COOLDOWN_MS ago. A "private" row (Steam reports achievements
 * as private) is terminal and skipped on every future call.
 *
 * Never throws - one player's failure (or Steam being down entirely) never
 * blocks the others or the caller. Intended to be called with the full
 * roster of a poll's live Snapshot, not gated by Match boundaries: this
 * gets a new player's avatar in front of visitors within one poll cycle of
 * them joining, rather than waiting for their Match to close.
 *
 * `onProgress` (optional) fires after each targeted player's upsert - the
 * regular on-sighting caller has no use for it (a poll's roster is small),
 * but a one-off backfill over hundreds of already-known players (see
 * backfill-steam-profiles.ts) needs visibility into an otherwise-silent
 * multi-minute run.
 */
export async function refreshUnseenSteamProfiles(
  db: Database,
  steamClient: SteamClient,
  appId: number,
  steamIds: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (steamIds.length === 0) {
    return;
  }

  const uniqueSteamIds = Array.from(new Set(steamIds));

  const existing = await db
    .select({
      steamId: steamProfiles.steamId,
      status: steamProfiles.status,
      fetchedAt: steamProfiles.fetchedAt,
    })
    .from(steamProfiles)
    .where(inArray(steamProfiles.steamId, uniqueSteamIds));

  const existingById = new Map(existing.map((row) => [row.steamId, row]));
  const now = Date.now();

  const targets = uniqueSteamIds.filter((steamId) => {
    const row = existingById.get(steamId);
    if (!row) {
      return true;
    }
    if (row.status !== "error") {
      return false;
    }
    return now - row.fetchedAt.getTime() >= ERROR_RETRY_COOLDOWN_MS;
  });

  // Always logged, even when targets is empty - otherwise this whole
  // subsystem is silent for every poll where nobody new/erroring is in the
  // roster, which is most polls, and looks indistinguishable from it never
  // running at all.
  console.log(
    `[worker] steam profile refresh: ${targets.length}/${uniqueSteamIds.length} player(s) need refresh`,
  );

  if (targets.length === 0) {
    return;
  }

  try {
    await ensureAchievementSchemaCached(db, steamClient, appId);
  } catch (error) {
    console.error("[worker] failed to cache Steam achievement schema:", error);
  }

  let summaries = new Map<
    string,
    { personaName: string; avatarUrl: string; countryCode: string | null }
  >();
  try {
    const fetched = await steamClient.fetchPlayerSummaries(targets);
    summaries = new Map(
      fetched.map((summary) => [
        summary.steamId,
        {
          personaName: summary.personaName,
          avatarUrl: summary.avatarUrl,
          countryCode: summary.countryCode,
        },
      ]),
    );
  } catch (error) {
    console.error("[worker] Steam player summaries fetch failed:", error);
  }

  // Sequential, not Promise.all: a worker restart can make a whole online
  // roster look "unseen" at once, and these calls aren't batchable.
  for (const [index, steamId] of targets.entries()) {
    const summary = summaries.get(steamId);

    if (!summary) {
      await upsertSteamProfile(db, {
        steamId,
        personaName: null,
        avatarUrl: null,
        countryCode: null,
        achievements: [],
        playtimeMinutes: null,
        status: "error",
        fetchedAt: new Date(),
      });
      console.log(`[worker] cached Steam profile for ${steamId}: status=error (no summary returned)`);
      onProgress?.(index + 1, targets.length);
      continue;
    }

    let achievementsResult;
    try {
      achievementsResult = await steamClient.fetchPlayerAchievements(steamId, appId);
    } catch (error) {
      console.error(`[worker] Steam achievements fetch failed for ${steamId}:`, error);
    }

    // Playtime is gated by the same "game details" privacy setting as
    // achievements, but fetched and failed independently: it's a separate
    // API call, and there's no reason a transient failure here should
    // affect the achievements-derived status below.
    let playtimeMinutes: number | null = null;
    try {
      playtimeMinutes = await steamClient.fetchPlayerPlaytimeMinutes(steamId, appId);
    } catch (error) {
      console.error(`[worker] Steam playtime fetch failed for ${steamId}:`, error);
    }

    const status: SteamProfileStatus =
      achievementsResult === undefined
        ? "error"
        : achievementsResult.available
          ? "ok"
          : "private";
    const achievements =
      achievementsResult?.available === true ? achievementsResult.achievements : [];

    await upsertSteamProfile(db, {
      steamId,
      personaName: summary.personaName,
      avatarUrl: summary.avatarUrl,
      countryCode: summary.countryCode,
      achievements,
      playtimeMinutes,
      status,
      fetchedAt: new Date(),
    });
    console.log(
      `[worker] cached Steam profile for ${steamId}: status=${status}, ${achievements.length} achievement(s), playtime=${playtimeMinutes ?? "null"} min`,
    );
    onProgress?.(index + 1, targets.length);
  }
}

/**
 * Re-fetches WARDOGS playtime for players in `joinedSteamIds` who already
 * have a cached SteamProfile row with status "ok" or "private" - keeps
 * playtime current across sessions instead of frozen at first-sighting
 * (refreshUnseenSteamProfiles only ever fetches it once, when a row is
 * first created). A brand-new steamId has no row yet, so it's naturally
 * skipped here and gets its first playtime fetch from
 * refreshUnseenSteamProfiles instead - see the call site in
 * snapshot-poller.ts for why that ordering avoids a redundant fetch. An
 * "error" row is also skipped, left to refreshUnseenSteamProfiles's own
 * cooldown-gated retry rather than doubling up on retry logic for the same
 * row. Never throws - one player's failure never blocks the others.
 */
export async function refreshPlaytimeOnJoin(
  db: Database,
  steamClient: SteamClient,
  appId: number,
  joinedSteamIds: string[],
): Promise<void> {
  if (joinedSteamIds.length === 0) {
    return;
  }

  const existing = await db
    .select({ steamId: steamProfiles.steamId, status: steamProfiles.status })
    .from(steamProfiles)
    .where(inArray(steamProfiles.steamId, Array.from(new Set(joinedSteamIds))));

  const targets = existing
    .filter((row) => row.status === "ok" || row.status === "private")
    .map((row) => row.steamId);

  console.log(
    `[worker] playtime-on-join: ${targets.length}/${joinedSteamIds.length} joiner(s) need refresh`,
  );

  for (const steamId of targets) {
    try {
      const playtimeMinutes = await steamClient.fetchPlayerPlaytimeMinutes(steamId, appId);
      await db.update(steamProfiles).set({ playtimeMinutes }).where(eq(steamProfiles.steamId, steamId));
      console.log(`[worker] refreshed playtime on join for ${steamId}: ${playtimeMinutes ?? "null"} min`);
    } catch (error) {
      console.error(`[worker] Steam playtime refresh failed for ${steamId}:`, error);
    }
  }
}

/**
 * Fetches a newly claimed Verified Player's SteamProfile as soon as apps/web
 * announces the claim (VERIFIED_PLAYER_CLAIMED_CHANNEL), so they see their
 * own name and avatar without waiting to next appear in a Snapshot. Same
 * skip rules as every other refresh: a steamId that already has a profile is
 * left alone. `ready` resolves once the LISTEN is active.
 */
export function startClaimedSteamProfileFetcher(
  db: Database,
  steamClient: SteamClient,
  appId: number,
  connectionString: string,
): { ready: Promise<void>; stop: () => Promise<void> } {
  return listenTo(connectionString, VERIFIED_PLAYER_CLAIMED_CHANNEL, (steamId) => {
    if (!/^\d{17}$/.test(steamId)) return;
    void refreshUnseenSteamProfiles(db, steamClient, appId, [steamId]);
  });
}
