import { createDb, requireEnv } from "@wdza-stats/db";
import { runHeartbeat } from "./heartbeat";

const HEARTBEAT_INTERVAL_MS = 60_000;

const db = createDb(requireEnv("DATABASE_URL"));
const baseUrl = requireEnv("RCON_BASE_URL");

async function tick() {
  const server = await runHeartbeat(db, baseUrl);
  console.log(`[worker] connected to Postgres, tracking "${server.name}"`);
}

await tick();
setInterval(() => {
  tick().catch((error) => console.error("[worker] heartbeat failed:", error));
}, HEARTBEAT_INTERVAL_MS);
