import { servers as serversTable, type Database } from "@wdza-stats/db";
import { eq } from "drizzle-orm";

export type TrackedServer = typeof serversTable.$inferSelect;

/**
 * Confirms the Worker can reach Postgres and that the configured Server
 * has been seeded, returning the tracked Server row. Run once on startup
 * before the snapshot-polling loop begins.
 */
export async function runHeartbeat(
  db: Database,
  baseUrl: string,
): Promise<TrackedServer> {
  const [server] = await db
    .select()
    .from(serversTable)
    .where(eq(serversTable.baseUrl, baseUrl))
    .limit(1);

  if (!server) {
    throw new Error(
      `No Server row found for baseUrl "${baseUrl}". Run the db:seed script first.`,
    );
  }

  return server;
}
