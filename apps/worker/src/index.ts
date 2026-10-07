import {
  createDb,
  loadRootEnv,
  requireEnv,
  SNAPSHOT_POLL_INTERVAL_MS,
  WARDOGS_STEAM_APP_ID,
} from "@wdza-stats/db";
import { startWarconBanSync } from "./ban-sync";
import { runHeartbeat } from "./heartbeat";
import { startKickVoteAnnouncer, startKickVoteResolver } from "./kick-vote-engine";
import { createRconClient } from "./rcon-client";
import { startSnapshotPolling, type SteamRefreshConfig } from "./snapshot-poller";
import { createSteamClient } from "./steam-client";
import { createWarconClient } from "./warcon-client";
import { startClaimedSteamProfileFetcher } from "./steam-profile-refresh";

loadRootEnv();

const databaseUrl = requireEnv("DATABASE_URL");
const db = createDb(databaseUrl);
const baseUrl = requireEnv("RCON_BASE_URL");
const token = requireEnv("RCON_TOKEN");

// Bans change rarely and Warcon is a third-party service, so it is read far
// less often than RCON. A new Warcon ban starts filtering Snapshots within this.
const WARCON_BAN_SYNC_INTERVAL_MS = 60_000;

const server = await runHeartbeat(db, baseUrl);
console.log(`[worker] connected to Postgres, tracking "${server.name}"`);

// STEAM_API_KEY is optional - unlike RCON, Steam enrichment is a nice-to-have
// on top of core snapshot polling, so a deployment without a key yet
// shouldn't fail to boot.
const steamApiKey = process.env.STEAM_API_KEY;
const steamConfig: SteamRefreshConfig | undefined = steamApiKey
  ? { client: createSteamClient(steamApiKey), appId: WARDOGS_STEAM_APP_ID }
  : undefined;

if (!steamConfig) {
  console.log("[worker] STEAM_API_KEY not set - Steam profile enrichment disabled");
}

const rconClient = createRconClient(baseUrl, token);
startSnapshotPolling(db, rconClient, server.id, SNAPSHOT_POLL_INTERVAL_MS, steamConfig);
console.log(
  `[worker] polling RCON every ${SNAPSHOT_POLL_INTERVAL_MS / 1000}s for "${server.name}"`,
);

const kickVoteAnnouncer = startKickVoteAnnouncer(db, rconClient, databaseUrl);
await kickVoteAnnouncer.ready;
console.log("[worker] listening for KickVote announcements");

// Sweeps on the poll cadence: a target leaving can only be noticed as often
// as the Snapshot it's checked against refreshes.
const kickVoteResolver = startKickVoteResolver(db, rconClient, server.id, databaseUrl, SNAPSHOT_POLL_INTERVAL_MS);
await kickVoteResolver.ready;
console.log("[worker] resolving KickVotes");

if (steamConfig) {
  const claimedProfileFetcher = startClaimedSteamProfileFetcher(db, steamConfig.client, steamConfig.appId, databaseUrl);
  await claimedProfileFetcher.ready;
  console.log("[worker] fetching SteamProfiles for newly claimed Verified Players");
}

// Optional like STEAM_API_KEY: without a Warcon key, banned_players holds only
// the bans Staff Members make in the admin area.
const warconApiKey = process.env.WARCON_API_KEY;
const warconOrgId = process.env.WARCON_ORG_ID;
if (warconApiKey && warconOrgId) {
  const warconClient = createWarconClient(
    process.env.WARCON_API_URL || "https://console.warcon.app",
    warconApiKey,
    warconOrgId,
  );
  startWarconBanSync(db, warconClient, WARCON_BAN_SYNC_INTERVAL_MS);
  console.log(`[worker] syncing Warcon bans every ${WARCON_BAN_SYNC_INTERVAL_MS / 1000}s`);
} else {
  console.log("[worker] WARCON_API_KEY or WARCON_ORG_ID not set - Warcon ban sync disabled");
}
