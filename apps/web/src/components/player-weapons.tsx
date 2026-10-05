import { WeaponStatsTable } from "@/components/weapon-stats-table";
import { formatMetres, headshotPercent } from "@/lib/weapon-stat-format";
import type { WeaponStat } from "@/lib/weapon-stats";

const PODIUM = [
  { place: "1st", accent: "border-brand-gold-500/60 text-brand-gold-500" },
  { place: "2nd", accent: "border-zinc-300/40 text-zinc-300" },
  { place: "3rd", accent: "border-amber-700/60 text-amber-600" },
];

/**
 * A player's top three weapons by kills, with every weapon they've scored a
 * Kill with in a collapsible table below. `weapons` comes from
 * getPlayerWeaponStats, most kills first.
 */
export function PlayerWeapons({ weapons }: { weapons: WeaponStat[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xl text-zinc-100">Top guns</h2>
      {weapons.length === 0 ? (
        <p className="text-zinc-400">No kills recorded by the kill feed yet.</p>
      ) : (
        <>
          <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {weapons.slice(0, PODIUM.length).map((stat, index) => (
              <li
                key={stat.cause}
                className={`rounded-lg border bg-zinc-900/60 px-4 py-3 ${PODIUM[index].accent}`}
              >
                <p className="text-xs font-medium uppercase tracking-wide">{PODIUM[index].place}</p>
                <p className="font-display text-xl text-zinc-50">{stat.weapon}</p>
                <p className="text-sm text-zinc-300">
                  {stat.kills} {stat.kills === 1 ? "kill" : "kills"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {headshotPercent(stat)}% headshots &middot; longest {formatMetres(stat.longestM)}
                </p>
              </li>
            ))}
          </ol>

          {weapons.length > PODIUM.length && (
            <details className="group">
              <summary className="cursor-pointer select-none text-sm text-zinc-400 hover:text-zinc-100">
                <span className="group-open:hidden">Show all {weapons.length} weapons</span>
                <span className="hidden group-open:inline">Hide all weapons</span>
              </summary>
              <div className="mt-3">
                <WeaponStatsTable weapons={weapons} />
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
