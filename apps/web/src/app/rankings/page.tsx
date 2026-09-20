import Link from "next/link";
import { CountryFlag } from "@/components/country-flag";
import { PlayerAvatar } from "@/components/player-avatar";
import { db } from "@/lib/db";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import {
  getRankings,
  isRankingMetric,
  parseRankingsPage,
  RANKING_METRICS,
  type RankingMetric,
} from "@/lib/rankings";

// A DB read via drizzle isn't a Request-time API, so Next won't otherwise
// know this route needs fresh data on every request - force it dynamic so
// visitors always see current standings.
export const dynamic = "force-dynamic";

const METRIC_LABELS: Record<RankingMetric, string> = {
  xp: "XP",
  kills: "Kills",
  wins: "Wins",
  streaks: "Best streak",
};

export default async function RankingsPage({
  searchParams,
}: {
  searchParams: Promise<{ metric?: string; page?: string }>;
}) {
  const { metric: rawMetric, page: rawPage } = await searchParams;
  const metric: RankingMetric =
    rawMetric !== undefined && isRankingMetric(rawMetric) ? rawMetric : "xp";
  const page = parseRankingsPage(rawPage);

  const result = await getRankings(db, CONFIGURED_SERVER_BASE_URL, metric, page);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Rankings</h1>
      <p className="max-w-2xl text-xs text-zinc-500">
        Progression rankings from the XP, wins, and streaks system. Looking
        for raw career stats instead? See the{" "}
        <Link href="/leaderboard" className="text-brand-gold-500 hover:underline">
          Leaderboard
        </Link>{" "}
        page.
      </p>
      <nav className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
        <span className="mr-2 text-zinc-500">Sort by</span>
        {RANKING_METRICS.map((option) => (
          <Link
            key={option}
            href={`/rankings?metric=${option}`}
            aria-current={option === metric ? "page" : undefined}
            className="rounded-full px-3 py-1 font-medium text-zinc-400 transition-colors hover:text-zinc-100 aria-[current=page]:bg-brand-green-700/40 aria-[current=page]:text-brand-gold-500"
          >
            {METRIC_LABELS[option]}
          </Link>
        ))}
      </nav>

      {result.rows.length === 0 ? (
        <p className="text-zinc-400">No players have any recorded stats yet.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[360px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Player</th>
                  <th className="px-4 py-3 font-medium">Level</th>
                  <th className="px-4 py-3 font-medium">{METRIC_LABELS[metric]}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {result.rows.map((row) => (
                  <tr key={row.steamId} className="hover:bg-white/5">
                    <td className="px-4 py-2.5 font-display text-base text-zinc-500">
                      {row.rank}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/players/${row.steamId}`}
                        className="flex items-center gap-2 font-medium text-zinc-100 hover:text-brand-gold-500"
                      >
                        <PlayerAvatar avatarUrl={row.avatarUrl} size={24} />
                        {row.displayName}
                        <CountryFlag countryCode={row.countryCode} />
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-300">{row.level}</td>
                    <td className="px-4 py-2.5 text-zinc-300">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.totalPages > 1 && (
            <div className="flex items-center gap-4 text-sm text-zinc-400">
              {page > 1 ? (
                <Link
                  href={`/rankings?metric=${metric}&page=${page - 1}`}
                  className="hover:text-brand-gold-500"
                >
                  ← Previous
                </Link>
              ) : (
                <span className="opacity-40">← Previous</span>
              )}
              <span>
                Page {page} of {result.totalPages}
              </span>
              {page < result.totalPages ? (
                <Link
                  href={`/rankings?metric=${metric}&page=${page + 1}`}
                  className="hover:text-brand-gold-500"
                >
                  Next →
                </Link>
              ) : (
                <span className="opacity-40">Next →</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
