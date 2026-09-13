// No @wdza-stats/db import here - this is used from Client Components
// (the match tables), and pulling in the db package would drag its
// `postgres` driver (Node-only, uses `fs`/`tls`/etc.) into the browser bundle.
export function formatMatchDuration(startedAt: string, endedAt: string): string {
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const minutes = Math.round(ms / 60000);
  return `${minutes} min`;
}
