import {
  createDb,
  loadRootEnv,
  requireEnv,
  SNAPSHOT_POLL_INTERVAL_MS,
  WARDOGS_STEAM_APP_ID,
} from "@wdza-stats/db";
import { runHeartbeat } from "./heartbeat";
import { startKickVoteAnnouncer, startKickVoteResolver } from "./kick-vote-engine";
import { createRconClient } from "./rcon-client";
import { startSnapshotPolling, type SteamRefreshConfig } from "./snapshot-poller";
import { createSteamClient } from "./steam-client";

loadRootEnv();

const databaseUrl = requireEnv("DATABASE_URL");
const db = createDb(databaseUrl);
const baseUrl = requireEnv("RCON_BASE_URL");
const token = requireEnv("RCON_TOKEN");

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
