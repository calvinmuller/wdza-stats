"use client";

import Link from "next/link";
import { CountryFlag } from "@/components/country-flag";
import { PlayerAvatar } from "@/components/player-avatar";
import { SortableTable, type SortableColumn } from "@/components/sortable-table";
import type { RankingMetric, RankingRow } from "@/lib/rankings";

function buildColumns(valueLabel: string): SortableColumn<RankingRow>[] {
  return [
    {
      key: "rank",
      label: "#",
      value: (row) => row.rank,
      numeric: true,
      cellClassName: "font-display text-base text-zinc-500",
    },
    {
      key: "displayName",
      label: "Player",
      value: (row) => row.displayName,
      cellClassName: "font-medium text-zinc-100",
      render: (row) => (
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
    { key: "level", label: "Level", value: (row) => row.level, numeric: true },
    { key: "value", label: valueLabel, value: (row) => row.value, numeric: true },
  ];
}

export function RankingsTable({
  rows,
  metric,
  valueLabel,
}: {
  rows: RankingRow[];
  metric: RankingMetric;
  valueLabel: string;
}) {
  const columns = buildColumns(valueLabel);

  return (
    <SortableTable
      // Rows for a different metric or page carry different steamIds in
      // general, but a player can appear at the same rowKey position across
      // pages - remounting on metric change resets the column sort back to
      // the server's own ranking instead of carrying over a stale sort.
      key={metric}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.steamId}
      defaultSort={{ column: "rank", direction: "asc" }}
      minWidthClassName="min-w-[360px]"
    />
  );
}
