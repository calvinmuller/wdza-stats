// One-off script: fetches SteamProfile data for every steamId already
// known to playerCareerStats, not just ones the Worker happens to see
// online again. Without this, a player who played before this feature
// shipped and never reconnects would wait indefinitely for an avatar -
// the regular on-sighting trigger (steam-profile-refresh.ts, wired into
// the RCON poll loop) only fires for players actually seen in a live
// Snapshot. Safe to re-run: it's the same refreshUnseenSteamProfiles used
// by that trigger, so already-cached players are skipped.
//
// Usage: npm run backfill:steam --workspace=@wdza-stats/worker

import {
  createDb,
  loadRootEnv,
  playerCareerStats,
  requireEnv,
  runIfMain,
  WARDOGS_STEAM_APP_ID,
} from "@wdza-stats/db";
import { createSteamClient } from "./steam-client";
import { refreshUnseenSteamProfiles } from "./steam-profile-refresh";

runIfMain(import.meta.url, async () => {
  loadRootEnv();

  const db = createDb(requireEnv("DATABASE_URL"));
  const steamClient = createSteamClient(requireEnv("STEAM_API_KEY"));

  const rows = await db.selectDistinct({ steamId: playerCareerStats.steamId }).from(playerCareerStats);
  const steamIds = rows.map((row) => row.steamId);

  console.log(`[backfill] fetching Steam profiles for ${steamIds.length} known player(s)...`);

  await refreshUnseenSteamProfiles(db, steamClient, WARDOGS_STEAM_APP_ID, steamIds, (done, total) => {
    if (done % 25 === 0 || done === total) {
      console.log(`[backfill] ${done}/${total}`);
    }
  });

  console.log("[backfill] done.");
  await db.$client.end();
});
