import {
  createDb,
  loadRootEnv,
  requireEnv,
  SNAPSHOT_POLL_INTERVAL_MS,
  WARDOGS_STEAM_APP_ID,
} from "@wdza-stats/db";
import { startWarconBanSync } from "./ban-sync";
import { bootstrapEnvServer } from "./heartbeat";
import { startKickVoteAnnouncer, startKickVoteResolver } from "./kick-vote-engine";
import { startWarconReservedSlotSync } from "./reserved-slot-sync";
import { startServerSupervisor } from "./server-supervisor";
import type { SteamRefreshConfig } from "./snapshot-poller";
import { createSteamClient } from "./steam-client";
import { createWarconClient } from "./warcon-client";
import { startClaimedSteamProfileFetcher } from "./steam-profile-refresh";

loadRootEnv();

const databaseUrl = requireEnv("DATABASE_URL");
const db = createDb(databaseUrl);

// Bans and reserved slots change rarely and Warcon is a third-party service,
// so it is read far less often than RCON. A new Warcon ban starts filtering
// Snapshots within this.
const WARCON_LIST_SYNC_INTERVAL_MS = 60_000;

// The servers table is re-read this often in case a servers_changed
// notification from /admin/servers was missed.
const SERVER_RECONCILE_INTERVAL_MS = 60_000;

// Servers are managed in /admin/servers (docs/adr/0011). RCON_BASE_URL and
// RCON_TOKEN are optional now: when set they carry a deployment from before
// that over, and never overwrite what an admin has since set.
const envBaseUrl = process.env.RCON_BASE_URL;
const envToken = process.env.RCON_TOKEN;
if (envBaseUrl && envToken) {
  const envServer = await bootstrapEnvServer(db, {
    name: process.env.SERVER_NAME || envBaseUrl,
    baseUrl: envBaseUrl,
    rconToken: envToken,
  });
  console.log(`[worker] env-configured server is "${envServer.name}" (/servers/${envServer.slug})`);
}
console.log("[worker] connected to Postgres");

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

const supervisor = startServerSupervisor(db, databaseUrl, SERVER_RECONCILE_INTERVAL_MS, {
  pollIntervalMs: SNAPSHOT_POLL_INTERVAL_MS,
  steamConfig,
});
await supervisor.ready;
if (supervisor.polledServerIds().length === 0) {
  console.log("[worker] no enabled server has an RCON token yet - add one in /admin/servers");
}

const kickVoteAnnouncer = startKickVoteAnnouncer(db, supervisor.clientFor, databaseUrl);
await kickVoteAnnouncer.ready;
console.log("[worker] listening for KickVote announcements");

// Sweeps on the poll cadence: a target leaving can only be noticed as often
// as the Snapshot it's checked against refreshes.
const kickVoteResolver = startKickVoteResolver(db, supervisor, databaseUrl, SNAPSHOT_POLL_INTERVAL_MS);
await kickVoteResolver.ready;
console.log("[worker] resolving KickVotes");

if (steamConfig) {
  const claimedProfileFetcher = startClaimedSteamProfileFetcher(db, steamConfig.client, steamConfig.appId, databaseUrl);
  await claimedProfileFetcher.ready;
  console.log("[worker] fetching SteamProfiles for newly claimed Verified Players");
}

// Optional like STEAM_API_KEY: without a Warcon key, banned_players holds only
// the bans Staff Members make in the admin area, and reserved_slots stays empty.
const warconApiKey = process.env.WARCON_API_KEY;
const warconOrgId = process.env.WARCON_ORG_ID;
if (warconApiKey && warconOrgId) {
  const warconClient = createWarconClient(
    process.env.WARCON_API_URL || "https://console.warcon.app",
    warconApiKey,
    warconOrgId,
  );
  startWarconBanSync(db, warconClient, WARCON_LIST_SYNC_INTERVAL_MS);
  startWarconReservedSlotSync(db, warconClient, WARCON_LIST_SYNC_INTERVAL_MS);
  console.log(`[worker] syncing Warcon bans and reserved slots every ${WARCON_LIST_SYNC_INTERVAL_MS / 1000}s`);
} else {
  console.log("[worker] WARCON_API_KEY or WARCON_ORG_ID not set - Warcon ban and reserved-slot sync disabled");
}
