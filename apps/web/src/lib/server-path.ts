// Where a Server's pages live on the public site. Plain string helpers with no
// database access, so Client Components can build links with them too.

/** `/servers/{slug}`, or a page under it when `path` (starting with "/") is given. */
export function serverPath(slug: string, path = ""): string {
  return `/servers/${encodeURIComponent(slug)}${path}`;
}

/**
 * The Server slug in a pathname under /servers/{slug}, and what follows it
 * (e.g. "/stats"), or null for any other pathname.
 */
export function parseServerPath(pathname: string): { slug: string; rest: string } | null {
  const match = /^\/servers\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!match) return null;
  return { slug: decodeURIComponent(match[1]), rest: match[2] ?? "" };
}
