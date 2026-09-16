// One-off script: fetches GetPlayerSummaries again for every SteamProfile
// row that predates the countryCode column. refreshUnseenSteamProfiles only
// targets steamIds with no cached row (or a stale "error" one) - an
// already-cached "ok"/"private" row is never revisited on a normal poll, so
// without this backfill those players would show no flag indefinitely.
// Safe to re-run: only rows with a null countryCode are targeted, so an
// already-backfilled player (or one whose Steam profile has no location
// set) is skipped on a later run.
//
// Usage: npm run backfill:country-codes --workspace=@wdza-stats/worker

import {
  createDb,
  loadRootEnv,
  requireEnv,
  runIfMain,
  steamProfiles,
  type SteamProfileStatus,
} from "@wdza-stats/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { createSteamClient } from "./steam-client";

// "error" rows have no confirmed identity yet - refreshUnseenSteamProfiles
// already retries those on next sighting, so this backfill only targets the
// two statuses that mean "we successfully talked to Steam about this
// player" (a private profile can still expose loccountrycode even when
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
        isNull(steamProfiles.countryCode),
        inArray(steamProfiles.status, BACKFILL_STATUSES),
      ),
    );

  console.log(`[backfill-country-codes] fetching country codes for ${rows.length} cached player(s)...`);

  // fetchPlayerSummaries chunks internally (Steam's 100-steamid-per-call
  // limit), so one call covers the whole list rather than one request per
  // player.
  const summaries = await steamClient.fetchPlayerSummaries(rows.map((row) => row.steamId));

  let updated = 0;
  for (const summary of summaries) {
    if (!summary.countryCode) {
      continue;
    }
    await db
      .update(steamProfiles)
      .set({ countryCode: summary.countryCode })
      .where(eq(steamProfiles.steamId, summary.steamId));
    updated += 1;
  }

  console.log(`[backfill-country-codes] updated ${updated}/${rows.length}.`);
  await db.$client.end();
});
