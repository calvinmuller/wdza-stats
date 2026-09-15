import Link from "next/link";
import { db } from "@/lib/db";
import {
  LEADERBOARD_SORTS,
  getLeaderboard,
  type LeaderboardSort,
} from "@/lib/leaderboard";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
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

      <p className="max-w-2xl text-xs text-zinc-500">
        The <span className="font-medium text-zinc-400">K/D</span> shown here
        has been adjusted: it blends each player&rsquo;s raw K/D toward the
        server average, weighted by matches played against 10
        &ldquo;average&rdquo; matches of prior — so a player with only a few
        games is pulled most of the way to the average, while a player with a
        long track record keeps most of their own number. This is what the
        K/D sort ranks by, so a lucky game or two won&rsquo;t outrank a proven
        record.
      </p>

      {rows.length === 0 ? (
        <p className="text-zinc-400">No players have any recorded stats yet.</p>
      ) : (
        <LeaderboardTable rows={rows} />
      )}
    </div>
  );
}
