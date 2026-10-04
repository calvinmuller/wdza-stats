import { listSeasons } from "@wdza-stats/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SeasonPicker } from "@/components/season-picker";
import { db } from "@/lib/db";
import {
  LEADERBOARD_SORTS,
  getLeaderboard,
  type LeaderboardSort,
} from "@/lib/leaderboard";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { seasonScopeParam } from "@/lib/season-param";
import { resolveSeasonScope } from "@/lib/season-scope";
import { LeaderboardTable } from "./leaderboard-table";

// A DB read via drizzle isn't a Request-time API, so Next won't otherwise
// know this route needs fresh data on every request - force it dynamic so
// visitors always see current totals.
export const dynamic = "force-dynamic";

const SORT_LABELS: Record<LeaderboardSort, string> = {
  kills: "Kills",
  deaths: "Deaths",
  kd: "K/D",
  cash: "Cash",
  playtime: "Playtime",
};

function isLeaderboardSort(value: string | undefined): value is LeaderboardSort {
  return LEADERBOARD_SORTS.includes(value as LeaderboardSort);
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; season?: string }>;
}) {
  const { sort: rawSort, season: rawSeason } = await searchParams;
  const sort: LeaderboardSort = isLeaderboardSort(rawSort) ? rawSort : "kills";
  const scope = await resolveSeasonScope(db, rawSeason, "current");
  if (!scope) notFound();

  const [rows, allSeasons] = await Promise.all([
    getLeaderboard(db, CONFIGURED_SERVER_BASE_URL, sort, scope),
    listSeasons(db),
  ]);

  // Playtime is the SteamProfile's all-time figure, never kept per Season.
  const playtimeLabel = scope.kind === "career" ? "Playtime" : "Playtime (all-time)";
  const sortLabels = { ...SORT_LABELS, playtime: playtimeLabel };

  const seasonParam = seasonScopeParam(scope);
  const leaderboardHref = (params: { season?: string; sort?: LeaderboardSort }) =>
    `/leaderboard?${new URLSearchParams({
      season: params.season ?? seasonParam,
      sort: params.sort ?? sort,
    })}`;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Leaderboard</h1>
      <SeasonPicker
        seasons={allSeasons}
        selected={scope}
        hrefFor={(option) => leaderboardHref({ season: option })}
      />
      <nav className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
        <span className="mr-2 text-zinc-500">Sort by</span>
        {LEADERBOARD_SORTS.map((option) => (
          <Link
            key={option}
            href={leaderboardHref({ sort: option })}
            aria-current={option === sort ? "page" : undefined}
            className="rounded-full px-3 py-1 font-medium text-zinc-400 transition-colors hover:text-zinc-100 aria-[current=page]:bg-brand-green-700/40 aria-[current=page]:text-brand-gold-500"
          >
            {sortLabels[option]}
          </Link>
        ))}
      </nav>

      <p className="max-w-2xl text-xs text-zinc-500">
        The <span className="font-medium text-zinc-400">K/D</span> shown here
        has been adjusted: it blends each player&rsquo;s raw K/D toward the
        server average, weighted by matches played against 10
        &ldquo;average&rdquo; matches of prior — so a player with only a few
        games is pulled most of the way to the average, while a player with a
        long track record keeps most of their own number. This is what the
        K/D sort ranks by, so a lucky game or two won&rsquo;t outrank a proven
        record.
        {scope.kind === "season" &&
          ` In a Season, both the average and the matches played are that Season’s own. Playtime is Steam’s all-time figure for each player.`}
      </p>

      {rows.length === 0 ? (
        <p className="text-zinc-400">
          {scope.kind === "career"
            ? "No players have any recorded stats yet."
            : `No players have played a Match in Season ${scope.season.number} yet.`}
        </p>
      ) : (
        <LeaderboardTable
          rows={rows}
          sort={sort}
          playtimeLabel={playtimeLabel}
        />
      )}
    </div>
  );
}
