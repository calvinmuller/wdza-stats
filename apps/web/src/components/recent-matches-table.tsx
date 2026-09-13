"use client";

import Link from "next/link";
import { SortableTable, type SortableColumn } from "@/components/sortable-table";
import { formatDateTime } from "@/lib/format-date";
import { formatMatchDuration } from "@/lib/format-duration";
import type { MatchHistoryView } from "@/lib/match-history";

const COLUMNS: SortableColumn<MatchHistoryView>[] = [
  {
    key: "map",
    label: "Map",
    value: (match) => match.map,
    cellClassName: "font-medium text-zinc-100",
    render: (match) => (
      <Link href={`/matches/${match.id}`} className="block hover:underline">
        {match.map}
      </Link>
    ),
  },
  {
    key: "experiences",
    label: "Experience",
    value: (match) => match.experiences.join(", "),
    render: (match) => (
      <Link href={`/matches/${match.id}`} className="block">
        {match.experiences.join(", ")}
      </Link>
    ),
  },
  {
    key: "playerCount",
    label: "Players",
    value: (match) => match.playerCount,
    numeric: true,
    render: (match) => (
      <Link href={`/matches/${match.id}`} className="block">
        {match.playerCount}
      </Link>
    ),
  },
  {
    key: "duration",
    label: "Duration",
    value: (match) => new Date(match.endedAt).getTime() - new Date(match.startedAt).getTime(),
    numeric: true,
    render: (match) => (
      <Link href={`/matches/${match.id}`} className="block">
        {formatMatchDuration(match.startedAt, match.endedAt)}
      </Link>
    ),
  },
  {
    key: "endedAt",
    label: "Ended",
    value: (match) => new Date(match.endedAt).getTime(),
    numeric: true,
    render: (match) => (
      <Link href={`/matches/${match.id}`} className="block">
        {formatDateTime(match.endedAt)}
      </Link>
    ),
  },
];

export function RecentMatchesTable({ matches }: { matches: MatchHistoryView[] }) {
  return (
    <SortableTable
      columns={COLUMNS}
      rows={matches}
      rowKey={(match) => match.id}
      defaultSort={{ column: "endedAt", direction: "desc" }}
      minWidthClassName="min-w-[560px]"
    />
  );
}
