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
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Player lookup</h1>
      <form action="/players" method="get" className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Player name"
          aria-label="Player name"
          className="w-full max-w-sm rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-brand-gold-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-brand-green-700 px-4 py-2 text-sm font-medium text-zinc-50 transition-colors hover:bg-brand-green-600"
        >
          Search
        </button>
      </form>

      {query && results.length === 0 && (
        <p className="text-zinc-400">
          No players found matching &quot;{query}&quot;.
        </p>
      )}

      {results.length > 0 && (
        <ul className="flex flex-col gap-2">
          {results.map((player) => (
            <li
              key={player.steamId}
              className="rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-2.5"
            >
              <Link
                href={`/players/${player.steamId}`}
                className="flex items-center font-medium text-zinc-100 hover:text-brand-gold-500"
              >
                {player.factionColor && <FactionSwatch color={player.factionColor} />}
                {player.displayName}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
