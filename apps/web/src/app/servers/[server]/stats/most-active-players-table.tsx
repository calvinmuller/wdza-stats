import Link from "next/link";
import { formatDateTime } from "@/lib/format-date";
import { formatServerPlaytime } from "@/lib/format-playtime";
import type { MostActivePlayerRow } from "@/lib/most-active-players";

const HEADERS = [
  { label: "Player", align: "text-left" },
  { label: "Playtime", align: "text-right" },
  { label: "Sessions", align: "text-right" },
  { label: "K", align: "text-right" },
  { label: "D", align: "text-right" },
  { label: "Last seen", align: "text-left" },
];

/**
 * The rows already ordered by getMostActivePlayers, most playtime first - a
 * plain table rather than a SortableTable, styled to match one.
 */
export function MostActivePlayersTable({ rows, basePath }: { rows: MostActivePlayerRow[]; basePath: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">No one has played yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
            {HEADERS.map((header) => (
              <th key={header.label} className={`px-4 py-3 font-medium ${header.align}`}>
                {header.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((row) => (
            <tr key={row.steamId} className="hover:bg-white/5">
              <td className="px-4 py-2.5">
                <span className="flex items-center gap-2">
                  <Link
                    href={`${basePath}/players/${row.steamId}`}
                    className="font-medium text-zinc-100 hover:text-brand-gold-500"
                  >
                    {row.displayName}
                  </Link>
                  {row.online && (
                    <span className="rounded border border-brand-green-600/60 bg-brand-green-900/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                      Online
                    </span>
                  )}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right text-zinc-300">
                {formatServerPlaytime(row.playtimeSeconds)}
              </td>
              <td className="px-4 py-2.5 text-right text-zinc-300">{row.sessions.toLocaleString("en-US")}</td>
              <td className="px-4 py-2.5 text-right text-zinc-300">{row.kills.toLocaleString("en-US")}</td>
              <td className="px-4 py-2.5 text-right text-zinc-300">{row.deaths.toLocaleString("en-US")}</td>
              <td className="px-4 py-2.5 whitespace-nowrap text-zinc-500">{formatDateTime(row.lastSeenAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
