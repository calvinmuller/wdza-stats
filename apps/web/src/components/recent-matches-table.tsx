"use client";

import Link from "next/link";
import { useMemo } from "react";
import { SortableTable, type SortableColumn } from "@/components/sortable-table";
import { formatDateTime } from "@/lib/format-date";
import { formatMatchDuration } from "@/lib/format-duration";
import type { MatchHistoryView } from "@/lib/match-history";

function buildColumns(basePath: string): SortableColumn<MatchHistoryView>[] {
  return [
    {
      key: "map",
      label: "Map",
      value: (match) => match.map,
      cellClassName: "font-medium text-zinc-100",
      render: (match) => (
        <Link href={`${basePath}/matches/${match.id}`} className="block hover:underline">
          {match.map}
        </Link>
      ),
    },
    {
      key: "experiences",
      label: "Experience",
      value: (match) => match.experiences.join(", "),
      render: (match) => (
        <Link href={`${basePath}/matches/${match.id}`} className="block">
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
        <Link href={`${basePath}/matches/${match.id}`} className="block">
          {match.playerCount}
        </Link>
      ),
    },
    {
      key: "winningFaction",
      label: "Winner",
      value: (match) => match.winningFaction ?? "",
      render: (match) => (
        <Link href={`${basePath}/matches/${match.id}`} className="block">
          {match.winningFaction ?? "—"}
        </Link>
      ),
    },
    {
      key: "mvp",
      label: "MVP",
      value: (match) => match.mvpDisplayName ?? "",
      render: (match) =>
        match.mvpPlayerSteamId ? (
          <Link
            href={`${basePath}/players/${match.mvpPlayerSteamId}`}
            className="block hover:underline"
          >
            {match.mvpDisplayName}
          </Link>
        ) : (
          <span className="block">—</span>
        ),
    },
    {
      key: "duration",
      label: "Duration",
      value: (match) => new Date(match.endedAt).getTime() - new Date(match.startedAt).getTime(),
      numeric: true,
      render: (match) => (
        <Link href={`${basePath}/matches/${match.id}`} className="block">
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
        <Link href={`${basePath}/matches/${match.id}`} className="block">
          {formatDateTime(match.endedAt)}
        </Link>
      ),
    },
  ];
}

export function RecentMatchesTable({ matches, basePath }: { matches: MatchHistoryView[]; basePath: string }) {
  const columns = useMemo(() => buildColumns(basePath), [basePath]);
  return (
    <SortableTable
      columns={columns}
      rows={matches}
      rowKey={(match) => match.id}
      defaultSort={{ column: "endedAt", direction: "desc" }}
      minWidthClassName="min-w-[720px]"
    />
  );
}
