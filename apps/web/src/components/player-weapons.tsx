import { StatPanel } from "@/components/stat-panel";
import { WeaponStatsTable } from "@/components/weapon-stats-table";
import { getWeaponImageUrl } from "@/lib/weapon-images";
import type { WeaponStat } from "@/lib/weapon-stats";

const TOP_WEAPONS = 3;

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

/** The weapon's art, or a crosshair stand-in, for a Kill's raw cause tag. */
export function WeaponThumbnail({ cause }: { cause: string }) {
  const imageUrl = getWeaponImageUrl(cause);
  return (
    <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded border border-white/10 bg-zinc-950/60">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        // No art for this weapon yet: a crosshair stands in.
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 text-zinc-600" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="7" />
          <path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
        </svg>
      )}
    </div>
  );
}

/**
 * The player's three most-used weapons by kills. `weapons` comes from
 * getPlayerWeaponStats, most kills first.
 */
export function TopWeaponsPanel({ weapons }: { weapons: WeaponStat[] }) {
  return (
    <StatPanel title="Top weapons">
      {weapons.length === 0 ? (
        <p className="text-sm text-zinc-400">No kills recorded by the kill feed yet.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-white/10">
          {weapons.slice(0, TOP_WEAPONS).map((stat) => (
            <li key={stat.cause} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
              <WeaponThumbnail cause={stat.cause} />
              <div className="min-w-0">
                <p className="font-display text-lg text-zinc-50">{stat.weapon}</p>
                <p className="text-sm text-zinc-400">
                  {plural(stat.kills, "kill", "kills")}, {plural(stat.headshots, "headshot", "headshots")}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-zinc-500">
        Weapon, distance and headshot counts only include kills made after the server&apos;s live kill feed was
        turned on.
      </p>
    </StatPanel>
  );
}

/** Every weapon the player has a Kill with, in a collapsed, sortable table. */
export function AllWeapons({ weapons }: { weapons: WeaponStat[] }) {
  if (weapons.length <= TOP_WEAPONS) return null;

  return (
    <details className="group">
      <summary className="cursor-pointer select-none text-sm text-zinc-400 hover:text-zinc-100">
        <span className="group-open:hidden">Show all {weapons.length} weapons</span>
        <span className="hidden group-open:inline">Hide all weapons</span>
      </summary>
      <div className="mt-3">
        <WeaponStatsTable weapons={weapons} />
      </div>
    </details>
  );
}
