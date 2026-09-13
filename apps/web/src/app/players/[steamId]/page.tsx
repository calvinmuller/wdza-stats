import { FactionSwatch } from "@/components/faction-swatch";
import { PlayerMatchHistoryTable } from "@/components/player-match-history-table";
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
          <PlayerMatchHistoryTable matches={matchHistory} />
        )}
      </div>
    </div>
  );
}
