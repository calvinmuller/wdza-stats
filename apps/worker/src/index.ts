import { createDb } from "@wdza-stats/db";
import { runHeartbeat } from "./heartbeat";

const HEARTBEAT_INTERVAL_MS = 60_000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

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
