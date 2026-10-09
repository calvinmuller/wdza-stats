import { AdBanner } from "@/components/ad-banner";
import { WeaponThumbnail } from "@/components/player-weapons";
import { SteamLinkBanner } from "@/components/steam-link-banner";
import { getBanner } from "@/lib/banners";
import { getCurrentVerifiedPlayerSteamId } from "@/lib/current-verified-player";
import { db } from "@/lib/db";
import { getPodium } from "@/lib/podium";
import { getServerDirectory } from "@/lib/server-lookup";
import type { ServerWeaponStat } from "@/lib/server-kill-stats";
import { getTopWeapons } from "@/lib/top-weapons";
import { headshotPercent } from "@/lib/weapon-stat-format";
import { HomePodium } from "./home-podium";
import { HomeServerCard } from "./home-server-card";

// A DB read via drizzle isn't a Request-time API, so Next won't otherwise
// know this route needs fresh data on every request - force it dynamic so
// visitors always see the latest poll.
export const dynamic = "force-dynamic";

function TopWeapons({ weapons }: { weapons: ServerWeaponStat[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl text-zinc-100">Top weapons</h2>
      {weapons.length === 0 ? (
        <p className="text-sm text-zinc-400">No kills recorded by the kill feed this Season yet.</p>
      ) : (
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {weapons.map((stat, index) => (
            <li
              key={stat.cause}
              className="flex flex-col gap-2 rounded-lg border border-white/10 bg-zinc-900/60 p-3"
            >
              <WeaponThumbnail cause={stat.cause} />
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-zinc-100">
                  <span className="text-zinc-500">{index + 1}. </span>
                  {stat.weapon}
                </span>
                <span className="text-sm text-zinc-300">{stat.kills.toLocaleString("en-US")}</span>
              </div>
              <span className="text-xs text-zinc-500">{headshotPercent(stat)}% headshots</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// The page that spans every Server (docs/adr/0011): the current Season's
// Podium, its most-used weapons, then a live card per Server linking to its
// own dashboard.
export default async function HomePage() {
  const [podium, directory, playerSteamId] = await Promise.all([
    getPodium(db),
    getServerDirectory(db),
    getCurrentVerifiedPlayerSteamId(),
  ]);
  const weapons = await getTopWeapons(db, { kind: "season", season: podium.season });

  return (
    <div className="flex flex-col gap-8">
      {playerSteamId === null && <SteamLinkBanner returnTo="/" />}
      <HomePodium podium={podium} />
      <TopWeapons weapons={weapons} />
      <section className="flex flex-col gap-3">
        <h2 className="text-xl text-zinc-100">Servers</h2>
        {directory.length === 0 ? (
          <p className="text-zinc-400">No servers are being tracked yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {directory.map((server) => (
              <li key={server.slug}>
                <HomeServerCard slug={server.slug} name={server.name} initial={server.live} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <AdBanner banner={getBanner("content")} className="mx-auto w-full max-w-sm" />
    </div>
  );
}
