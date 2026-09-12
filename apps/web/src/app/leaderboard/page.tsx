import Link from "next/link";
import { db } from "@/lib/db";
import {
  LEADERBOARD_SORTS,
  getLeaderboard,
  type LeaderboardSort,
} from "@/lib/leaderboard";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";

// A DB read via drizzle isn't a Request-time API, so Next won't otherwise
// know this route needs fresh data on every request - force it dynamic so
// visitors always see current totals.
export const dynamic = "force-dynamic";

const SORT_LABELS: Record<LeaderboardSort, string> = {
  kills: "Kills",
  deaths: "Deaths",
  kd: "K/D",
  cash: "Cash",
};

function isLeaderboardSort(value: string | undefined): value is LeaderboardSort {
  return LEADERBOARD_SORTS.includes(value as LeaderboardSort);
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort: rawSort } = await searchParams;
  const sort: LeaderboardSort = isLeaderboardSort(rawSort) ? rawSort : "kills";

  const rows = await getLeaderboard(db, CONFIGURED_SERVER_BASE_URL, sort);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Leaderboard</h1>
      <nav className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
        <span className="mr-2 text-zinc-500">Sort by</span>
        {LEADERBOARD_SORTS.map((option) => (
          <Link
            key={option}
            href={`/leaderboard?sort=${option}`}
            aria-current={option === sort ? "page" : undefined}
            className="rounded-full px-3 py-1 font-medium text-zinc-400 transition-colors hover:text-zinc-100 aria-[current=page]:bg-brand-green-700/40 aria-[current=page]:text-brand-gold-500"
          >
            {SORT_LABELS[option]}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="text-zinc-400">No players have any recorded stats yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Player</th>
                <th className="px-4 py-3 font-medium">Kills</th>
                <th className="px-4 py-3 font-medium">Deaths</th>
                <th className="px-4 py-3 font-medium">K/D</th>
                <th className="px-4 py-3 font-medium">Cash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row, index) => (
                <tr key={row.steamId} className="hover:bg-white/5">
                  <td className="px-4 py-2.5 font-display text-base text-zinc-500">
                    {index + 1}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/players/${row.steamId}`}
                      className="flex items-center font-medium text-zinc-100 hover:text-brand-gold-500"
                    >
                      {row.displayName}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-300">{row.kills}</td>
                  <td className="px-4 py-2.5 text-zinc-300">{row.deaths}</td>
                  <td className="px-4 py-2.5 text-zinc-300">{row.kd.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-zinc-300">{row.cash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
