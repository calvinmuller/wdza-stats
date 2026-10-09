import { latestSnapshots, servers, type Database } from "@wdza-stats/db";
import { and, asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { serverPath } from "./server-path";

export async function getServerByBaseUrl(db: Database, baseUrl: string) {
  const [server] = await db
    .select()
    .from(servers)
    .where(eq(servers.baseUrl, baseUrl))
    .limit(1);

  return server;
}

/** What the public site may say about a Server: never its RCON token or feed token hash. */
export interface PublicServer {
  id: number;
  name: string;
  slug: string;
  baseUrl: string;
}

const publicColumns = { id: servers.id, name: servers.name, slug: servers.slug, baseUrl: servers.baseUrl };

/** The enabled Servers, in the order they were added - the first is the default. */
export async function listPublicServers(db: Database): Promise<PublicServer[]> {
  return db.select(publicColumns).from(servers).where(eq(servers.enabled, true)).orderBy(asc(servers.id));
}

/** The enabled Server at /servers/{slug}, if there is one. A disabled Server is not on the public site. */
export async function getPublicServerBySlug(db: Database, slug: string): Promise<PublicServer | undefined> {
  const [server] = await db
    .select(publicColumns)
    .from(servers)
    .where(and(eq(servers.slug, slug), eq(servers.enabled, true)))
    .limit(1);
  return server;
}

/** For pages under /servers/[server]: the Server the URL names, or the 404 page. */
export async function requirePublicServer(db: Database, params: Promise<{ server: string }>): Promise<PublicServer> {
  const { server: slug } = await params;
  const server = await getPublicServerBySlug(db, slug);
  if (!server) notFound();
  return server;
}

/**
 * For the URLs from before there was more than one Server (/stats, /players/1,
 * ...): sends them to the same page on the default Server, keeping the query
 * string. With no enabled Server there is nowhere to go but the home page.
 */
export async function redirectToDefaultServer(
  db: Database,
  path: string,
  searchParams: Record<string, string | string[] | undefined> = {},
): Promise<never> {
  const [server] = await listPublicServers(db);
  if (!server) redirect("/");
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  const suffix = query.size > 0 ? `?${query}` : "";
  redirect(`${serverPath(server.slug, path)}${suffix}`);
}

/**
 * For /api/* routes, which keep their paths and take the Server as
 * `?server={slug}` - the default Server when it's left out, so callers from
 * before there was more than one keep working. A Response (404) when the slug
 * names no enabled Server.
 */
export async function resolveApiServer(db: Database, searchParams: URLSearchParams): Promise<PublicServer | Response> {
  const slug = searchParams.get("server");
  const server = slug ? await getPublicServerBySlug(db, slug) : (await listPublicServers(db))[0];
  return server ?? Response.json({ error: "Unknown Server." }, { status: 404 });
}

/** One enabled Server as the home page's directory shows it. */
export interface ServerDirectoryEntry extends PublicServer {
  /** From its latest Snapshot; null until the Worker has polled it. */
  live: { map: string; playerCount: number; maxPlayers: number; capturedAt: string } | null;
}

export async function getServerDirectory(db: Database): Promise<ServerDirectoryEntry[]> {
  const rows = await db
    .select({ ...publicColumns, capturedAt: latestSnapshots.capturedAt, payload: latestSnapshots.payload })
    .from(servers)
    .leftJoin(latestSnapshots, eq(latestSnapshots.serverId, servers.id))
    .where(eq(servers.enabled, true))
    .orderBy(asc(servers.id));

  return rows.map(({ capturedAt, payload, ...server }) => ({
    ...server,
    live:
      capturedAt && payload
        ? {
            map: payload.map,
            playerCount: payload.players.length,
            maxPlayers: payload.playerSlots.max,
            capturedAt: capturedAt.toISOString(),
          }
        : null,
  }));
}
