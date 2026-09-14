"use client";

import Link from "next/link";
import { PlayerAvatar } from "@/components/player-avatar";
import { SortableTable, type SortableColumn } from "@/components/sortable-table";
import type { MatchPlayerStatView } from "@/lib/match-history";

const COLUMNS: SortableColumn<MatchPlayerStatView>[] = [
  {
    key: "displayName",
    label: "Player",
    value: (player) => player.displayName,
    cellClassName: "font-medium text-zinc-100",
    render: (player) => (
      <Link
        href={`/players/${player.steamId}`}
        className="flex items-center gap-2 hover:underline"
      >
        <PlayerAvatar avatarUrl={player.avatarUrl} size={24} />
        {player.displayName}
      </Link>
    ),
  },
  { key: "faction", label: "Faction", value: (player) => player.faction },
  { key: "kills", label: "Kills", value: (player) => player.kills, numeric: true },
  { key: "deaths", label: "Deaths", value: (player) => player.deaths, numeric: true },
  {
    key: "kd",
    label: "K/D",
    value: (player) => player.kd,
    numeric: true,
    render: (player) => player.kd.toFixed(2),
  },
  { key: "cash", label: "Cash", value: (player) => player.cash, numeric: true },
];

export function MatchPlayerTable({ players }: { players: MatchPlayerStatView[] }) {
  return (
    <SortableTable
      columns={COLUMNS}
      rows={players}
      rowKey={(player) => player.steamId}
      defaultSort={{ column: "kills", direction: "desc" }}
      minWidthClassName="min-w-[520px]"
    />
  );
}
