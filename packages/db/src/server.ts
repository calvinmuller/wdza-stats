import { sql } from "drizzle-orm";
import type { Database } from "./client";

// The Postgres NOTIFY channel apps/web sends on whenever an admin adds or
// edits a Server (payload: the Server's id, as a string). The Worker LISTENs
// here to start, restart or stop that Server's polling straight away rather
// than on its next periodic re-read of the servers table.
export const SERVERS_CHANGED_CHANNEL = "servers_changed";

/** Tells the Worker that this Server's row changed. */
export async function notifyServersChanged(db: Database, serverId: number): Promise<void> {
  await db.execute(sql`select pg_notify(${SERVERS_CHANGED_CHANNEL}, ${String(serverId)})`);
}

export const MAX_SERVER_SLUG_LENGTH = 40;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Whether `slug` can be a Server's /servers/{slug} path segment. */
export function isValidServerSlug(slug: string): boolean {
  return slug.length <= MAX_SERVER_SLUG_LENGTH && SLUG_PATTERN.test(slug);
}

/** A suggested slug for a Server name, e.g. "[WDZA] Wardogs #2" -> "wdza-wardogs-2". */
export function slugifyServerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, MAX_SERVER_SLUG_LENGTH)
    .replace(/^-+|-+$/g, "");
}
