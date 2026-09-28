import { sql } from "drizzle-orm";
import type { Database } from "./client";

// The Postgres NOTIFY channel a freshly-stored Snapshot is announced on
// (payload: the Server's id, as a string). worker -> web, like the "kills"
// channel (docs/adr/0004): the homepage's live stream LISTENs here and
// re-reads the Server's live view the moment a poll lands, instead of the
// browser polling on a timer. Kept out of snapshot.ts, which the browser
// bundle imports directly.
export const SNAPSHOT_CAPTURED_CHANNEL = "snapshot_captured";

/** Tells every SNAPSHOT_CAPTURED_CHANNEL listener that this Server has a new latest Snapshot. */
export async function notifySnapshotCaptured(db: Database, serverId: number): Promise<void> {
  await db.execute(sql`select pg_notify(${SNAPSHOT_CAPTURED_CHANNEL}, ${String(serverId)})`);
}
