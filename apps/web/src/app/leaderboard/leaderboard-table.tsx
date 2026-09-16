"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CountryFlag } from "@/components/country-flag";
import { PlayerAvatar } from "@/components/player-avatar";
import { formatPlaytimeHours } from "@/lib/format-playtime";
import type { LeaderboardRow } from "@/lib/leaderboard";

export function LeaderboardTable({ rows }: { rows: LeaderboardRow[] }) {
  const [search, setSearch] = useState("");

  // Rank reflects each player's position in the full, unfiltered
  // leaderboard - searching narrows which rows are shown, but a filtered
  // row keeps the rank it actually holds rather than being renumbered.
  const rankedRows = useMemo(
    () => rows.map((row, index) => ({ row, rank: index + 1 })),
    [rows],
  );

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return rankedRows;
    }
    return rankedRows.filter(({ row }) =>
      row.displayName.toLowerCase().includes(query),
    );
  }, [rankedRows, search]);

  return (
    <div className="flex flex-col gap-4">
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search players…"
        aria-label="Search players"
        className="w-full max-w-xs rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-brand-gold-500 focus:outline-none"
      />

      {visibleRows.length === 0 ? (
        <p className="text-zinc-400">No players match &ldquo;{search}&rdquo;.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Player</th>
                <th className="px-4 py-3 font-medium">Kills</th>
                <th className="px-4 py-3 font-medium">Deaths</th>
                <th
                  className="px-4 py-3 font-medium"
                  title="This K/D has been adjusted toward the server average — see the note below the table"
                >
                  K/D
                </th>
                <th className="px-4 py-3 font-medium">Cash</th>
                <th className="px-4 py-3 font-medium">Playtime</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {visibleRows.map(({ row, rank }) => (
                <tr key={row.steamId} className="hover:bg-white/5">
                  <td className="px-4 py-2.5 font-display text-base text-zinc-500">
                    {rank}
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
                  <td className="px-4 py-2.5 text-zinc-300">{row.kills}</td>
                  <td className="px-4 py-2.5 text-zinc-300">{row.deaths}</td>
                  <td className="px-4 py-2.5 text-zinc-300">
                    {row.adjustedKd.toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-300">{row.cash}</td>
                  <td className="px-4 py-2.5 text-zinc-300">
                    {row.playtimeMinutes !== null
                      ? formatPlaytimeHours(row.playtimeMinutes)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
