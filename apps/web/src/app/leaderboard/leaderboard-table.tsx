"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CountryFlag } from "@/components/country-flag";
import { PlayerAvatar } from "@/components/player-avatar";
import { SortableTable, type SortableColumn } from "@/components/sortable-table";
import { formatPlaytimeHours } from "@/lib/format-playtime";
import type { LeaderboardRow, LeaderboardSort } from "@/lib/leaderboard";

type RankedRow = { row: LeaderboardRow; rank: number };

const COLUMNS: SortableColumn<RankedRow>[] = [
  {
    key: "rank",
    label: "#",
    value: ({ rank }) => rank,
    numeric: true,
    cellClassName: "font-display text-base text-zinc-500",
  },
  {
    key: "displayName",
    label: "Player",
    value: ({ row }) => row.displayName,
    cellClassName: "font-medium text-zinc-100",
    render: ({ row }) => (
      <Link
        href={`/players/${row.steamId}`}
        className="flex items-center gap-2 font-medium text-zinc-100 hover:text-brand-gold-500"
      >
        <PlayerAvatar avatarUrl={row.avatarUrl} size={24} />
        {row.displayName}
        <CountryFlag countryCode={row.countryCode} />
      </Link>
    ),
  },
  { key: "kills", label: "Kills", value: ({ row }) => row.kills, numeric: true },
  { key: "deaths", label: "Deaths", value: ({ row }) => row.deaths, numeric: true },
  {
    key: "kd",
    label: "K/D",
    value: ({ row }) => row.adjustedKd,
    numeric: true,
    headerTitle:
      "This K/D has been adjusted toward the server average — see the note below the table",
    render: ({ row }) => row.adjustedKd.toFixed(2),
  },
  { key: "cash", label: "Cash", value: ({ row }) => row.cash, numeric: true },
  {
    key: "playtime",
    label: "Playtime",
    value: ({ row }) => row.playtimeMinutes ?? -1,
    numeric: true,
    render: ({ row }) =>
      row.playtimeMinutes !== null ? formatPlaytimeHours(row.playtimeMinutes) : "—",
  },
];

const DEFAULT_SORT_COLUMN: Record<LeaderboardSort, string> = {
  kills: "kills",
  deaths: "deaths",
  kd: "kd",
  cash: "cash",
  playtime: "playtime",
};

export function LeaderboardTable({
  rows,
  sort,
}: {
  rows: LeaderboardRow[];
  sort: LeaderboardSort;
}) {
  const [search, setSearch] = useState("");

  // Rank reflects each player's position in the full, unfiltered
  // leaderboard - searching narrows which rows are shown, and sorting by a
  // different column reorders them, but a row always keeps the rank it
  // actually holds under the server-selected metric above.
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
        <SortableTable
          columns={COLUMNS}
          rows={visibleRows}
          rowKey={({ row }) => row.steamId}
          defaultSort={{ column: DEFAULT_SORT_COLUMN[sort], direction: "desc" }}
          minWidthClassName="min-w-[480px]"
        />
      )}
    </div>
  );
}
