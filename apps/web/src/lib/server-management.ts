import {
  isValidServerSlug,
  latestSnapshots,
  MAX_SERVER_SLUG_LENGTH,
  notifyServersChanged,
  servers,
  type Database,
} from "@wdza-stats/db";
import { and, asc, eq, ne, or } from "drizzle-orm";

// Adding and editing Servers from /admin/servers (docs/adr/0011). Callers must
// already have checked the actor is an admin. Every change is announced on
// servers_changed so the Worker starts, restarts or stops polling at once.

export type ServerResult = { ok: true; serverId: number } | { ok: false; error: string };

export interface ServerInput {
  name: string;
  slug: string;
  baseUrl: string;
  /** Required to add a Server; when editing, blank keeps the token it has. */
  rconToken: string;
  enabled: boolean;
}

/** One Server as the admin page lists it. Never carries the RCON token itself. */
export interface ServerListing {
  id: number;
  name: string;
  slug: string;
  baseUrl: string;
  enabled: boolean;
  hasRconToken: boolean;
  hasFeedToken: boolean;
  lastSnapshotAt: Date | null;
}

export async function listServersForAdmin(db: Database): Promise<ServerListing[]> {
  const rows = await db
    .select({
      id: servers.id,
      name: servers.name,
      slug: servers.slug,
      baseUrl: servers.baseUrl,
      enabled: servers.enabled,
      rconToken: servers.rconToken,
      feedTokenHash: servers.feedTokenHash,
      lastSnapshotAt: latestSnapshots.capturedAt,
    })
    .from(servers)
    .leftJoin(latestSnapshots, eq(latestSnapshots.serverId, servers.id))
    .orderBy(asc(servers.id));

  return rows.map(({ rconToken, feedTokenHash, ...server }) => ({
    ...server,
    hasRconToken: rconToken !== null,
    hasFeedToken: feedTokenHash !== null,
  }));
}

/**
 * The RCON API's origin as the Worker will call it, or null if it isn't an
 * http(s) URL. Trailing slashes are dropped so the same address can't be
 * added twice by typing it two ways.
 */
export function normaliseRconBaseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url.toString().replace(/\/+$/, "");
}

type Checked = { ok: true; name: string; slug: string; baseUrl: string } | { ok: false; error: string };

async function check(db: Database, input: ServerInput, serverId: number | null): Promise<Checked> {
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  if (!name) return { ok: false, error: "Enter a name." };
  if (!isValidServerSlug(slug)) {
    return {
      ok: false,
      error: `The URL name can only use lowercase letters, numbers and single dashes, up to ${MAX_SERVER_SLUG_LENGTH} characters.`,
    };
  }
  const baseUrl = normaliseRconBaseUrl(input.baseUrl);
  if (!baseUrl) return { ok: false, error: "Enter the RCON URL, e.g. http://203.0.113.10:9006." };

  const clashes = await db
    .select({ slug: servers.slug, baseUrl: servers.baseUrl })
    .from(servers)
    .where(
      and(
        or(eq(servers.slug, slug), eq(servers.baseUrl, baseUrl)),
        serverId === null ? undefined : ne(servers.id, serverId),
      ),
    );
  if (clashes.some((clash) => clash.slug === slug)) {
    return { ok: false, error: "Another Server already uses that URL name." };
  }
  if (clashes.some((clash) => clash.baseUrl === baseUrl)) {
    return { ok: false, error: "Another Server already uses that RCON URL." };
  }
  return { ok: true, name, slug, baseUrl };
}

export async function addServer(db: Database, input: ServerInput): Promise<ServerResult> {
  const checked = await check(db, input, null);
  if (!checked.ok) return checked;
  const rconToken = input.rconToken.trim();
  if (!rconToken) return { ok: false, error: "Enter the Server's RCON token." };

  const [server] = await db
    .insert(servers)
    .values({ name: checked.name, slug: checked.slug, baseUrl: checked.baseUrl, rconToken, enabled: input.enabled })
    .returning({ id: servers.id });
  await notifyServersChanged(db, server.id);
  return { ok: true, serverId: server.id };
}

export async function updateServer(db: Database, serverId: number, input: ServerInput): Promise<ServerResult> {
  const checked = await check(db, input, serverId);
  if (!checked.ok) return checked;
  const rconToken = input.rconToken.trim();

  const [server] = await db
    .update(servers)
    .set({
      name: checked.name,
      slug: checked.slug,
      baseUrl: checked.baseUrl,
      enabled: input.enabled,
      ...(rconToken ? { rconToken } : {}),
    })
    .where(eq(servers.id, serverId))
    .returning({ id: servers.id });
  if (!server) return { ok: false, error: "That Server no longer exists." };
  await notifyServersChanged(db, server.id);
  return { ok: true, serverId: server.id };
}
