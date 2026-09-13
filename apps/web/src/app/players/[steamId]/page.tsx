import { FactionSwatch } from "@/components/faction-swatch";
import { db } from "@/lib/db";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { getPlayerMatchHistory } from "@/lib/match-history";
import { getPlayerCareerStat } from "@/lib/player-lookup";

// A DB read via drizzle isn't a Request-time API, so Next won't otherwise
// know this route needs fresh data on every request - force it dynamic so
// visitors always see current totals.
export const dynamic = "force-dynamic";

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ steamId: string }>;
}) {
  const { steamId } = await params;
  const player = await getPlayerCareerStat(db, CONFIGURED_SERVER_BASE_URL, steamId);

  if (!player) {
    return <p className="text-zinc-400">No player found with that Steam ID.</p>;
  }

  const matchHistory = await getPlayerMatchHistory(
    db,
    CONFIGURED_SERVER_BASE_URL,
    steamId,
  );

  const stats = [
    { label: "Kills", value: player.kills },
    { label: "Deaths", value: player.deaths },
    { label: "K/D", value: player.kd.toFixed(2) },
    { label: "Cash", value: player.cash },
    { label: "Matches played", value: player.matchesPlayed },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="flex items-center text-3xl">
        {player.factionColor && <FactionSwatch color={player.factionColor} />}
        {player.displayName}
      </h1>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-3"
          >
            <dt className="text-xs uppercase tracking-wide text-zinc-500">
              {stat.label}
            </dt>
            <dd className="font-display text-2xl text-zinc-50">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl text-zinc-100">Match history</h2>
        {matchHistory.length === 0 ? (
          <p className="text-zinc-400">No completed matches yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-3 font-medium">Map</th>
                  <th className="px-4 py-3 font-medium">Faction</th>
                  <th className="px-4 py-3 font-medium">Kills</th>
                  <th className="px-4 py-3 font-medium">Deaths</th>
                  <th className="px-4 py-3 font-medium">K/D</th>
                  <th className="px-4 py-3 font-medium">Cash</th>
                  <th className="px-4 py-3 font-medium">Ended</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {matchHistory.map((match) => (
                  <tr key={match.matchId} className="hover:bg-white/5">
                    <td className="px-4 py-2.5 font-medium text-zinc-100">
                      {match.map}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-300">
                      {match.faction}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-300">
                      {match.kills}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-300">
                      {match.deaths}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-300">
                      {match.kd.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-300">
                      {match.cash}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-300">
                      {new Date(match.endedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
