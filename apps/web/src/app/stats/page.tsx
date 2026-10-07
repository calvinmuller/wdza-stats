import { listSeasons } from "@wdza-stats/db";
import { notFound } from "next/navigation";
import { FactionWinsChart } from "@/components/faction-wins-chart";
import { SeasonPicker } from "@/components/season-picker";
import { StatPanel } from "@/components/stat-panel";
import { getBannedSteamIds } from "@/lib/banned-players";
import { db } from "@/lib/db";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { getMostActivePlayers } from "@/lib/most-active-players";
import { getLongestKills, getServerWeaponStats, getTopKillers } from "@/lib/server-kill-stats";
import { getServerByBaseUrl } from "@/lib/server-lookup";
import { getServerStats } from "@/lib/server-stats";
import { resolveSeasonScope } from "@/lib/season-scope";
import { LongestKillsPanel } from "./longest-kills-panel";
import { MostActivePlayersTable } from "./most-active-players-table";
import { ServerWeaponsPanel } from "./server-weapons-panel";
import { TopKillersTable } from "./top-killers-table";

// A DB read via drizzle isn't a Request-time API, so Next won't otherwise
// know this route needs fresh data on every request - force it dynamic so
// visitors always see current totals.
export const dynamic = "force-dynamic";

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const { season: rawSeason } = await searchParams;
  const scope = await resolveSeasonScope(db, rawSeason, "current");
  if (!scope) notFound();

  const [stats, mostActivePlayers, allSeasons, server, bannedSteamIds] = await Promise.all([
    getServerStats(db, CONFIGURED_SERVER_BASE_URL, scope),
    getMostActivePlayers(db, CONFIGURED_SERVER_BASE_URL, scope),
    listSeasons(db),
    getServerByBaseUrl(db, CONFIGURED_SERVER_BASE_URL),
    getBannedSteamIds(db),
  ]);
  const [weapons, longestKills, topKillers] = server
    ? await Promise.all([
        getServerWeaponStats(db, server.id, scope, bannedSteamIds),
        getLongestKills(db, server.id, scope, bannedSteamIds),
        getTopKillers(db, server.id, scope, bannedSteamIds),
      ])
    : [[], [], []];

  const tiles = [
    { label: "Matches played", value: stats.totalMatches },
    { label: "Unique players", value: stats.uniquePlayers },
    { label: "Total kills", value: stats.totalKills },
    { label: "Total deaths", value: stats.totalDeaths },
  ];

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl">Server stats</h1>
      <SeasonPicker
        seasons={allSeasons}
        selected={scope}
        hrefFor={(option) => `/stats?${new URLSearchParams({ season: option })}`}
      />

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-3"
          >
            <dt className="text-xs uppercase tracking-wide text-zinc-500">
              {tile.label}
            </dt>
            <dd className="font-display text-2xl text-zinc-50">
              {tile.value.toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl text-zinc-100">Match wins by faction</h2>
        <FactionWinsChart factionWins={stats.factionWins} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ServerWeaponsPanel weapons={weapons} />
        <LongestKillsPanel kills={longestKills} />
      </div>

      <StatPanel title="Top killers">
        <TopKillersTable rows={topKillers} />
      </StatPanel>

      <StatPanel title="Most active players">
        <MostActivePlayersTable rows={mostActivePlayers} />
      </StatPanel>
    </div>
  );
}
