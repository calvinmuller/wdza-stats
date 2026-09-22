import Link from "next/link";
import { db } from "@/lib/db";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import {
  getRankings,
  isRankingMetric,
  parseRankingsPage,
  RANKING_METRICS,
  type RankingMetric,
} from "@/lib/rankings";
import { RankingsTable } from "./rankings-table";

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
          <RankingsTable
            rows={result.rows}
            metric={metric}
            valueLabel={METRIC_LABELS[metric]}
          />

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
