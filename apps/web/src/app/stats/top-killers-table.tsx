"use client";

import Link from "next/link";
import { SortableTable, type SortableColumn } from "@/components/sortable-table";
import { kdRatio } from "@/lib/player-career-stats";
import type { TopKiller } from "@/lib/server-kill-stats";
import { formatMetres, headshotPercent } from "@/lib/weapon-stat-format";

// Picked out in gold: more team kills than an occasional accident explains.
const TEAM_KILL_HIGHLIGHT = 3;

const COLUMNS: SortableColumn<TopKiller>[] = [
  {
    key: "player",
    label: "Player",
    value: (row) => row.displayName,
    render: (row) => (
      <Link href={`/players/${row.steamId}`} className="font-medium hover:text-brand-gold-500">
        {row.displayName}
      </Link>
    ),
    cellClassName: "text-zinc-100",
  },
  { key: "kills", label: "K", value: (row) => row.kills, numeric: true },
  { key: "deaths", label: "D", value: (row) => row.deaths, numeric: true },
  {
    key: "kd",
    label: "K/D",
    value: (row) => kdRatio(row.kills, row.deaths),
    numeric: true,
    render: (row) => kdRatio(row.kills, row.deaths).toFixed(2),
  },
  {
    key: "headshots",
    label: "Headshots",
    value: (row) => row.headshots,
    numeric: true,
    render: (row) => `${row.headshots.toLocaleString("en-US")} · ${headshotPercent(row)}%`,
  },
  { key: "teamKills", label: "Team kills", value: (row) => row.teamKills, numeric: true },
  {
    key: "average",
    label: "Avg distance",
    value: (row) => row.averageM ?? -1,
    numeric: true,
    render: (row) => formatMetres(row.averageM),
  },
];

/** The Server's top killers by the kill feed, from getTopKillers. */
export function TopKillersTable({ rows }: { rows: TopKiller[] }) {
  return (
    <SortableTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(row) => row.steamId}
      defaultSort={{ column: "kills", direction: "desc" }}
      minWidthClassName="min-w-[640px]"
      emptyMessage="No kills recorded by the kill feed yet."
      highlightRow={(row) => row.teamKills >= TEAM_KILL_HIGHLIGHT}
    />
  );
}
