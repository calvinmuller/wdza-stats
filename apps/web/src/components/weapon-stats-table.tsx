"use client";

import { SortableTable, type SortableColumn } from "@/components/sortable-table";
import { formatMetres, headshotPercent } from "@/lib/weapon-stat-format";
import type { WeaponStat } from "@/lib/weapon-stats";

const COLUMNS: SortableColumn<WeaponStat>[] = [
  {
    key: "weapon",
    label: "Weapon",
    value: (stat) => stat.weapon,
    cellClassName: "font-medium text-zinc-100",
  },
  { key: "kills", label: "Kills", value: (stat) => stat.kills, numeric: true },
  { key: "headshots", label: "Headshots", value: (stat) => stat.headshots, numeric: true },
  {
    key: "headshotPercent",
    label: "HS %",
    value: headshotPercent,
    numeric: true,
    render: (stat) => `${headshotPercent(stat)}%`,
  },
  {
    key: "longest",
    label: "Longest",
    value: (stat) => stat.longestM ?? -1,
    numeric: true,
    render: (stat) => formatMetres(stat.longestM),
  },
  {
    key: "average",
    label: "Avg distance",
    value: (stat) => stat.averageM ?? -1,
    numeric: true,
    render: (stat) => formatMetres(stat.averageM),
  },
];

export function WeaponStatsTable({ weapons }: { weapons: WeaponStat[] }) {
  return (
    <SortableTable
      columns={COLUMNS}
      rows={weapons}
      rowKey={(stat) => stat.cause}
      defaultSort={{ column: "kills", direction: "desc" }}
      minWidthClassName="min-w-[520px]"
    />
  );
}
