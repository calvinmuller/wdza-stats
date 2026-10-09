import { servers as serversTable, type Database } from "@wdza-stats/db";
import { and, eq, isNull } from "drizzle-orm";

export type TrackedServer = typeof serversTable.$inferSelect;

/**
 * Carries a deployment configured before Servers were managed in /admin
 * (docs/adr/0011) over to the servers table: makes sure the env-configured
 * Server has a row, and gives it the env's RCON token if it has none yet.
 * Never overwrites what an admin has since set - a row's name, slug and token
 * all belong to /admin/servers once they exist. Run once on startup.
 */
export async function bootstrapEnvServer(
  db: Database,
  input: { name: string; baseUrl: string; rconToken: string },
): Promise<TrackedServer> {
  await db
    .insert(serversTable)
    .values({ name: input.name, baseUrl: input.baseUrl, rconToken: input.rconToken })
    .onConflictDoNothing({ target: serversTable.baseUrl });

  await db
    .update(serversTable)
    .set({ rconToken: input.rconToken })
    .where(and(eq(serversTable.baseUrl, input.baseUrl), isNull(serversTable.rconToken)));

  const [server] = await db
    .select()
    .from(serversTable)
    .where(eq(serversTable.baseUrl, input.baseUrl))
    .limit(1);
  return server;
}
