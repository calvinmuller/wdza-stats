import { listSeasons } from "@wdza-stats/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SeasonPicker } from "@/components/season-picker";
import { db } from "@/lib/db";
import {
  getRankings,
  isRankingMetric,
  parseRankingsPage,
  RANKING_METRICS,
  type RankingMetric,
} from "@/lib/rankings";
import { seasonScopeParam } from "@/lib/season-param";
import { resolveSeasonScope } from "@/lib/season-scope";
import { requirePublicServer } from "@/lib/server-lookup";
import { serverPath } from "@/lib/server-path";
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
  params,
  searchParams,
}: {
  params: Promise<{ server: string }>;
  searchParams: Promise<{ metric?: string; page?: string; season?: string }>;
}) {
  const server = await requirePublicServer(db, params);
  const basePath = serverPath(server.slug);
  const { metric: rawMetric, page: rawPage, season: rawSeason } = await searchParams;
  const metric: RankingMetric =
    rawMetric !== undefined && isRankingMetric(rawMetric) ? rawMetric : "xp";
  const page = parseRankingsPage(rawPage);
  const scope = await resolveSeasonScope(db, rawSeason, "current");
  if (!scope) notFound();

  const [result, allSeasons] = await Promise.all([
    getRankings(db, server.baseUrl, metric, page, scope),
    listSeasons(db),
  ]);

  const seasonParam = seasonScopeParam(scope);
  const rankingsHref = (options: { season?: string; metric?: RankingMetric; page?: number }) => {
    const query = new URLSearchParams({
      season: options.season ?? seasonParam,
      metric: options.metric ?? metric,
    });
    if (options.page !== undefined) query.set("page", String(options.page));
    return `${basePath}/rankings?${query}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Rankings</h1>
      <p className="max-w-2xl text-xs text-zinc-500">
        Progression rankings from the XP, wins, and streaks system. Looking
        for raw stats like deaths and cash instead? See the{" "}
        <Link href={`${basePath}/leaderboard`} className="text-brand-gold-500 hover:underline">
          Leaderboard
        </Link>{" "}
        page.
      </p>
      <SeasonPicker
        seasons={allSeasons}
        selected={scope}
        hrefFor={(option) => rankingsHref({ season: option })}
      />
      <nav className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
        <span className="mr-2 text-zinc-500">Sort by</span>
        {RANKING_METRICS.map((option) => (
          <Link
            key={option}
            href={rankingsHref({ metric: option })}
            aria-current={option === metric ? "page" : undefined}
            className="rounded-full px-3 py-1 font-medium text-zinc-400 transition-colors hover:text-zinc-100 aria-[current=page]:bg-brand-green-700/40 aria-[current=page]:text-brand-gold-500"
          >
            {METRIC_LABELS[option]}
          </Link>
        ))}
      </nav>

      {result.rows.length === 0 ? (
        <p className="text-zinc-400">
          {scope.kind === "career"
            ? "No players have any recorded stats yet."
            : `No players have played a Match in Season ${scope.season.number} yet.`}
        </p>
      ) : (
        <>
          <RankingsTable
            rows={result.rows}
            metric={metric}
            seasonParam={seasonParam}
            valueLabel={METRIC_LABELS[metric]}
            basePath={basePath}
          />

          {result.totalPages > 1 && (
            <div className="flex items-center gap-4 text-sm text-zinc-400">
              {page > 1 ? (
                <Link
                  href={rankingsHref({ page: page - 1 })}
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
                  href={rankingsHref({ page: page + 1 })}
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
