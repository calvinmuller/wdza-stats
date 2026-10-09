"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CountryFlag } from "@/components/country-flag";
import { PlayerAvatar } from "@/components/player-avatar";
import { SortableTable, type SortableColumn } from "@/components/sortable-table";
import type { MatchPlayerStatView } from "@/lib/match-history";

function buildColumns(basePath: string): SortableColumn<MatchPlayerStatView>[] {
  return [
    {
      key: "displayName",
      label: "Player",
      value: (player) => player.displayName,
      cellClassName: "font-medium text-zinc-100",
      render: (player) => (
        <Link
          href={`${basePath}/players/${player.steamId}`}
          className="flex items-center gap-2 hover:underline"
        >
          <PlayerAvatar avatarUrl={player.avatarUrl} size={24} />
          {player.displayName}
          <CountryFlag countryCode={player.countryCode} />
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
}

export function MatchPlayerTable({ players, basePath }: { players: MatchPlayerStatView[]; basePath: string }) {
  const columns = useMemo(() => buildColumns(basePath), [basePath]);
  return (
    <SortableTable
      columns={columns}
      rows={players}
      rowKey={(player) => player.steamId}
      defaultSort={{ column: "kills", direction: "desc" }}
      minWidthClassName="min-w-[520px]"
    />
  );
}
