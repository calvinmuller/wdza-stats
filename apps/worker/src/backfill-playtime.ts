// One-off script: fetches WARDOGS playtime for every SteamProfile row that
// predates the playtimeMinutes column. refreshUnseenSteamProfiles only
// targets steamIds with no cached row (or a stale "error" one) - an
// already-cached "ok"/"private" row is never revisited on a normal poll, so
// without this backfill those players would show no playtime on the
// leaderboard indefinitely. Safe to re-run: only rows with a null
// playtimeMinutes are targeted, so an already-backfilled player is skipped.
//
// Usage: npm run backfill:playtime --workspace=@wdza-stats/worker

import {
  createDb,
  loadRootEnv,
  requireEnv,
  runIfMain,
  steamProfiles,
  WARDOGS_STEAM_APP_ID,
  type SteamProfileStatus,
} from "@wdza-stats/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { createSteamClient } from "./steam-client";

// "error" rows have no confirmed identity yet - refreshUnseenSteamProfiles
// already retries those on next sighting, so this backfill only targets the
// two statuses that mean "we successfully talked to Steam about this
// player" (private game details can still permit playtime even when
// achievements don't, so "private" is still worth attempting).
const BACKFILL_STATUSES: SteamProfileStatus[] = ["ok", "private"];

runIfMain(import.meta.url, async () => {
  loadRootEnv();

  const db = createDb(requireEnv("DATABASE_URL"));
  const steamClient = createSteamClient(requireEnv("STEAM_API_KEY"));

  const rows = await db
    .select({ steamId: steamProfiles.steamId })
    .from(steamProfiles)
    .where(
      and(
        isNull(steamProfiles.playtimeMinutes),
        inArray(steamProfiles.status, BACKFILL_STATUSES),
      ),
    );

  console.log(`[backfill-playtime] fetching playtime for ${rows.length} cached player(s)...`);

  let done = 0;
  for (const { steamId } of rows) {
    try {
      const playtimeMinutes = await steamClient.fetchPlayerPlaytimeMinutes(
        steamId,
        WARDOGS_STEAM_APP_ID,
      );
      await db
        .update(steamProfiles)
        .set({ playtimeMinutes })
        .where(eq(steamProfiles.steamId, steamId));
    } catch (error) {
      console.error(`[backfill-playtime] failed for ${steamId}:`, error);
    }

    done += 1;
    if (done % 25 === 0 || done === rows.length) {
      console.log(`[backfill-playtime] ${done}/${rows.length}`);
    }
  }

  console.log("[backfill-playtime] done.");
  await db.$client.end();
});
