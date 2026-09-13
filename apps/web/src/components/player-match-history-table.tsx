"use client";

import Link from "next/link";
import { SortableTable, type SortableColumn } from "@/components/sortable-table";
import { formatDateTime } from "@/lib/format-date";
import type { PlayerMatchHistoryView } from "@/lib/match-history";

const COLUMNS: SortableColumn<PlayerMatchHistoryView>[] = [
  {
    key: "map",
    label: "Map",
    value: (match) => match.map,
    cellClassName: "font-medium text-zinc-100",
    render: (match) => (
      <Link href={`/matches/${match.matchId}`} className="hover:underline">
        {match.map}
      </Link>
    ),
  },
  { key: "faction", label: "Faction", value: (match) => match.faction },
  { key: "kills", label: "Kills", value: (match) => match.kills, numeric: true },
  { key: "deaths", label: "Deaths", value: (match) => match.deaths, numeric: true },
  {
    key: "kd",
    label: "K/D",
    value: (match) => match.kd,
    numeric: true,
    render: (match) => match.kd.toFixed(2),
  },
  { key: "cash", label: "Cash", value: (match) => match.cash, numeric: true },
  {
    key: "endedAt",
    label: "Ended",
    value: (match) => new Date(match.endedAt).getTime(),
    numeric: true,
    render: (match) => (
      <Link href={`/matches/${match.matchId}`}>
        {formatDateTime(match.endedAt)}
      </Link>
    ),
  },
];

export function PlayerMatchHistoryTable({
  matches,
}: {
  matches: PlayerMatchHistoryView[];
}) {
  return (
    <SortableTable
      columns={COLUMNS}
      rows={matches}
      rowKey={(match) => match.matchId}
      defaultSort={{ column: "endedAt", direction: "desc" }}
      minWidthClassName="min-w-[520px]"
    />
  );
}
