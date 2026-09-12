import {
  latestSnapshots,
  servers,
  type Database,
  type Snapshot,
} from "@wdza-stats/db";
import { eq } from "drizzle-orm";

export interface LiveSnapshotView {
  serverName: string;
  capturedAt: string;
  snapshot: Snapshot;
}

/**
 * Reads the given Server's latest Snapshot from Postgres. Returns null when
 * the Server isn't seeded, or hasn't been polled by the Worker yet.
 */
export async function getLiveSnapshot(
  db: Database,
  baseUrl: string,
): Promise<LiveSnapshotView | null> {
  const [row] = await db
    .select({
      serverName: servers.name,
      capturedAt: latestSnapshots.capturedAt,
      payload: latestSnapshots.payload,
    })
    .from(servers)
    .innerJoin(latestSnapshots, eq(latestSnapshots.serverId, servers.id))
    .where(eq(servers.baseUrl, baseUrl))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    serverName: row.serverName,
    capturedAt: row.capturedAt.toISOString(),
    snapshot: row.payload,
  };
}
