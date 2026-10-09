import { StatPanel } from "@/components/stat-panel";
import type { ServerWeaponStat } from "@/lib/server-kill-stats";
import { headshotPercent } from "@/lib/weapon-stat-format";

/**
 * The Server's most-used weapons and vehicles, each with a bar sized against
 * the most-used one. `weapons` comes from getServerWeaponStats, most kills
 * first.
 */
export function ServerWeaponsPanel({ weapons }: { weapons: ServerWeaponStat[] }) {
  const most = weapons[0]?.kills ?? 0;

  return (
    <StatPanel title="Weapons and vehicles">
      {weapons.length === 0 ? (
        <p className="text-sm text-zinc-400">No kills recorded by the kill feed yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {weapons.map((stat) => (
            <li key={stat.cause} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="text-zinc-100">{stat.weapon}</span>
                  <span className="text-zinc-500"> · {headshotPercent(stat)}% headshots</span>
                </span>
                <span className="text-zinc-300">{stat.kills.toLocaleString("en-US")}</span>
              </div>
              <div className="h-1 rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-brand-gold-500"
                  style={{ width: `${(stat.kills / most) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </StatPanel>
  );
}
