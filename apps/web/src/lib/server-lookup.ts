import { servers, type Database } from "@wdza-stats/db";
import { eq } from "drizzle-orm";

export async function getServerByBaseUrl(db: Database, baseUrl: string) {
  const [server] = await db
    .select()
    .from(servers)
    .where(eq(servers.baseUrl, baseUrl))
    .limit(1);

  return server;
}
