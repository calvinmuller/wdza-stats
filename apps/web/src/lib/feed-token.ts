import { randomBytes } from "node:crypto";
import { servers, type Database } from "@wdza-stats/db";
import { eq } from "drizzle-orm";
import { hashFeedToken } from "./kill-feed";

/**
 * Issues a new kill feed token for a Server and returns it. This is the only
 * time the plaintext exists: just its hash is stored, so a lost token can't be
 * recovered, only replaced - and replacing it invalidates the previous one,
 * which is also how a leaked token is revoked. Null if the Server is unknown.
 */
export async function generateFeedToken(db: Database, serverId: number): Promise<string | null> {
  const token = `wkf_${randomBytes(32).toString("base64url")}`;
  const [row] = await db
    .update(servers)
    .set({ feedTokenHash: hashFeedToken(token) })
    .where(eq(servers.id, serverId))
    .returning({ id: servers.id });
  return row ? token : null;
}
