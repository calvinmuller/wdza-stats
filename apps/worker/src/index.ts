import { createDb, requireEnv, SNAPSHOT_POLL_INTERVAL_MS } from "@wdza-stats/db";
import { runHeartbeat } from "./heartbeat";
import { createRconClient } from "./rcon-client";
import { startSnapshotPolling } from "./snapshot-poller";

const db = createDb(requireEnv("DATABASE_URL"));
const baseUrl = requireEnv("RCON_BASE_URL");
const token = requireEnv("RCON_TOKEN");

const server = await runHeartbeat(db, baseUrl);
console.log(`[worker] connected to Postgres, tracking "${server.name}"`);

const rconClient = createRconClient(baseUrl, token);
startSnapshotPolling(db, rconClient, server.id, SNAPSHOT_POLL_INTERVAL_MS);
console.log(
  `[worker] polling RCON every ${SNAPSHOT_POLL_INTERVAL_MS / 1000}s for "${server.name}"`,
);
