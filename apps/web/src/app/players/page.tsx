import Link from "next/link";
import { FactionSwatch } from "@/components/faction-swatch";
import { db } from "@/lib/db";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { searchPlayersByName } from "@/lib/player-lookup";

// A DB read via drizzle isn't a Request-time API, so Next won't otherwise
// know this route needs fresh data on every request - force it dynamic so
// search results always reflect current totals.
export const dynamic = "force-dynamic";

export default async function PlayerSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const results = query
    ? await searchPlayersByName(db, CONFIGURED_SERVER_BASE_URL, query)
    : [];

  return (
    <main>
      <h1>Player lookup</h1>
      <form action="/players" method="get">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Player name"
          aria-label="Player name"
        />
        <button type="submit">Search</button>
      </form>

      {query && results.length === 0 && (
        <p>No players found matching &quot;{query}&quot;.</p>
      )}

      {results.length > 0 && (
        <ul className="player-search-results">
          {results.map((player) => (
            <li key={player.steamId}>
              <Link href={`/players/${player.steamId}`} className="player-link">
                {player.factionColor && <FactionSwatch color={player.factionColor} />}
                {player.displayName}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
