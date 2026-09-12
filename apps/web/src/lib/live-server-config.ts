import { requireEnv } from "@wdza-stats/db";

// The one Server this deployment tracks - same env var the Worker uses to
// identify its Server row (apps/worker/src/heartbeat.ts), read here only as
// a Postgres lookup key. Never used to reach the RCON API itself.
export const CONFIGURED_SERVER_BASE_URL = requireEnv("RCON_BASE_URL");
