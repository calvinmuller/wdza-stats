import Link from "next/link";
import { FactionSwatch } from "@/components/faction-swatch";
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
    <main>
      <h1>Leaderboard</h1>
      <nav className="sort-links">
        Sort by:{" "}
        {LEADERBOARD_SORTS.map((option) => (
          <Link
            key={option}
            href={`/leaderboard?sort=${option}`}
            aria-current={option === sort ? "page" : undefined}
          >
            {SORT_LABELS[option]}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p>No players have any recorded stats yet.</p>
      ) : (
        <div className="players-table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Kills</th>
                <th>Deaths</th>
                <th>K/D</th>
                <th>Cash</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.steamId}>
                  <td>{index + 1}</td>
                  <td>
                    <Link href={`/players/${row.steamId}`} className="player-link">
                      {row.factionColor && <FactionSwatch color={row.factionColor} />}
                      {row.displayName}
                    </Link>
                  </td>
                  <td>{row.kills}</td>
                  <td>{row.deaths}</td>
                  <td>{row.kd.toFixed(2)}</td>
                  <td>{row.cash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
