import Link from "next/link";
import { CountryFlag } from "@/components/country-flag";
import { PlayerAvatar } from "@/components/player-avatar";
import type { WeaponLeaderboardRow } from "@/lib/weapon-leaderboard";

const HEADERS = ["#", "Player", "Kills", "Headshots"];

/**
 * The ranked rows, already ordered by getWeaponLeaderboard. Rank is the only
 * order that means anything here, so this is a plain table rather than a
 * SortableTable, styled to match one.
 */
export function WeaponLeaderboardTable({ rows }: { rows: WeaponLeaderboardRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
            {HEADERS.map((header) => (
              <th key={header} className="px-4 py-3 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((row) => (
            <tr key={row.steamId} className="hover:bg-white/5">
              <td className="px-4 py-2.5 font-display text-base text-zinc-500">{row.rank}</td>
              <td className="px-4 py-2.5">
                <Link
                  href={`/players/${row.steamId}`}
                  className="flex items-center gap-2 font-medium text-zinc-100 hover:text-brand-gold-500"
                >
                  <PlayerAvatar avatarUrl={row.avatarUrl} size={24} />
                  {row.displayName}
                  <CountryFlag countryCode={row.countryCode} />
                </Link>
              </td>
              <td className="px-4 py-2.5 text-zinc-300">{row.kills.toLocaleString("en-US")}</td>
              <td className="px-4 py-2.5 text-zinc-300">{row.headshots.toLocaleString("en-US")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
