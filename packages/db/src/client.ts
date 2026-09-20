import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const client = postgres(connectionString, { onnotice: () => {} });
  return drizzle(client, { schema });
}

/**
 * A dedicated connection that LISTENs on one Postgres channel. `ready` settles
 * once the LISTEN is in place (a notification sent before then is missed);
 * `onListen` runs again after every automatic reconnect, which is the caller's
 * cue to catch up on anything sent while the connection was down.
 */
export function listenTo(
  connectionString: string,
  channel: string,
  onNotify: (payload: string) => void,
  onListen?: () => void,
) {
  const client = postgres(connectionString, { onnotice: () => {}, max: 1 });
  return {
    ready: client.listen(channel, onNotify, onListen).then(() => undefined),
    stop: () => client.end({ timeout: 1 }),
  };
}
