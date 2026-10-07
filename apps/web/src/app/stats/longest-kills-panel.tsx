import Link from "next/link";
import { StatPanel } from "@/components/stat-panel";
import { formatDateTime } from "@/lib/format-date";
import type { LongestKill } from "@/lib/server-kill-stats";

const HEADERS = [
  { label: "When", align: "text-left" },
  { label: "Killer", align: "text-left" },
  { label: "Victim", align: "text-left" },
  { label: "Cause", align: "text-left" },
  { label: "Distance", align: "text-right" },
];

function PlayerLink({ steamId, name }: { steamId: string; name: string }) {
  return (
    <Link href={`/players/${steamId}`} className="text-zinc-100 hover:text-brand-gold-500">
      {name}
    </Link>
  );
}

/** The Server's longest Kills, from getLongestKills, longest first. */
export function LongestKillsPanel({ kills }: { kills: LongestKill[] }) {
  return (
    <StatPanel title="Longest kills">
      {kills.length === 0 ? (
        <p className="text-sm text-zinc-400">No kills with a distance recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[520px] border-collapse text-sm">
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
              {kills.map((kill) => (
                <tr key={kill.id} className="hover:bg-white/5">
                  <td className="px-4 py-2.5 text-zinc-500">{formatDateTime(kill.receivedAt)}</td>
                  <td className="px-4 py-2.5">
                    <PlayerLink steamId={kill.killerSteamId} name={kill.killerName} />
                  </td>
                  <td className="px-4 py-2.5">
                    <PlayerLink steamId={kill.victimSteamId} name={kill.victimName} />
                  </td>
                  <td className="px-4 py-2.5 text-zinc-300">{kill.weapon ?? "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-right text-zinc-100">
                    {kill.distanceM.toLocaleString("en-US")} m
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </StatPanel>
  );
}
