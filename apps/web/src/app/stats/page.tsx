import { FactionWinsChart } from "@/components/faction-wins-chart";
import { db } from "@/lib/db";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { getServerStats } from "@/lib/server-stats";

// A DB read via drizzle isn't a Request-time API, so Next won't otherwise
// know this route needs fresh data on every request - force it dynamic so
// visitors always see current totals.
export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const stats = await getServerStats(db, CONFIGURED_SERVER_BASE_URL);

  const tiles = [
    { label: "Matches played", value: stats.totalMatches },
    { label: "Unique players", value: stats.uniquePlayers },
    { label: "Total kills", value: stats.totalKills },
    { label: "Total deaths", value: stats.totalDeaths },
  ];

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl">Server stats</h1>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-3"
          >
            <dt className="text-xs uppercase tracking-wide text-zinc-500">
              {tile.label}
            </dt>
            <dd className="font-display text-2xl text-zinc-50">
              {tile.value.toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl text-zinc-100">Match wins by faction</h2>
        <FactionWinsChart factionWins={stats.factionWins} />
      </div>
    </div>
  );
}
