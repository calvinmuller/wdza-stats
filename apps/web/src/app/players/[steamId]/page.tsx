import { listSeasons } from "@wdza-stats/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AchievementBadges } from "@/components/achievement-badges";
import { SeasonPicker } from "@/components/season-picker";
import { SteamAvatar } from "@/components/steam-avatar";
import { db } from "@/lib/db";
import { getPlayerOverall } from "@/lib/player-overall";
import { seasonScopeParam } from "@/lib/season-param";
import { resolveSeasonScope } from "@/lib/season-scope";
import { serverPath } from "@/lib/server-path";
import { getSteamProfile } from "@/lib/steam-profile-lookup";
import { isVerifiedPlayer } from "@/lib/verified-player";

// A DB read via drizzle isn't a Request-time API, so Next won't otherwise
// know this route needs fresh data on every request - force it dynamic so
// visitors always see current totals.
export const dynamic = "force-dynamic";

// A player across every Server: their PlayerOverallStat (see CONTEXT.md),
// with each Server's share linking to that Server's own player page, where
// Achievements, Challenges and match history live. Before there was more
// than one Server this URL was that page on the only one (docs/adr/0011).
export default async function PlayerOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ steamId: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const { steamId } = await params;
  const { season: rawSeason } = await searchParams;
  // The Season picker scopes the totals and the breakdown; the overall
  // level is career-long whatever it says.
  const scope = await resolveSeasonScope(db, rawSeason, "current");
  if (!scope) notFound();

  const [overall, steamProfile, verified, allSeasons] = await Promise.all([
    getPlayerOverall(db, steamId, scope),
    getSteamProfile(db, steamId),
    isVerifiedPlayer(db, steamId),
    listSeasons(db),
  ]);

  if (!overall) {
    return <p className="text-zinc-400">No player found with that Steam ID.</p>;
  }

  const { identity, totals } = overall;
  const { progress } = identity;
  const playerHref = (season: string) =>
    `/players/${encodeURIComponent(steamId)}?${new URLSearchParams({ season })}`;
  const stats = totals
    ? [
        { label: "XP", value: totals.xp.toLocaleString("en-US") },
        { label: "Kills", value: totals.kills },
        { label: "Deaths", value: totals.deaths },
        { label: "K/D", value: totals.kd.toFixed(2) },
        { label: "Cash", value: totals.cash },
        { label: "Matches played", value: totals.matchesPlayed },
        { label: "Matches won", value: totals.matchesWon },
        { label: "Matches lost", value: totals.matchesLost },
        { label: "Highest kill streak", value: totals.highestKillStreak },
        { label: "MVP count", value: totals.mvpCount },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="flex flex-wrap items-center gap-x-4 gap-y-1 text-3xl">
        {identity.displayName}
        <SteamAvatar
          avatarUrl={identity.avatarUrl}
          personaName={steamProfile?.personaName ?? null}
          countryCode={identity.countryCode}
        />
        {verified && (
          <span
            title="This player has signed in with Steam and owns this Steam ID"
            className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium tracking-wide text-emerald-400"
          >
            Verified
          </span>
        )}
      </h1>

      <div className="rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="font-display text-lg text-zinc-50">Overall Lv {identity.level}</span>
          <span className="text-xs text-zinc-500">
            {identity.careerXp.toLocaleString("en-US")} XP across every server
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress.progressPercent}%` }} />
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          {progress.xpRequiredForNextLevel === null
            ? "Max level reached"
            : `${progress.xpIntoLevel} / ${progress.xpRequiredForNextLevel} XP to overall level ${progress.level + 1}`}
        </p>
      </div>

      <SeasonPicker seasons={allSeasons} selected={scope} hrefFor={playerHref} />

      {scope.kind === "season" && !totals ? (
        <p className="text-zinc-400">
          No matches yet in Season {scope.season.number}.{" "}
          <Link href={playerHref(seasonScopeParam({ kind: "career" }))} className="text-brand-gold-500 hover:underline">
            See career stats
          </Link>
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-3">
                <dt className="text-xs uppercase tracking-wide text-zinc-500">{stat.label}</dt>
                <dd className="font-display text-2xl text-zinc-50">{stat.value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-col gap-3">
            <h2 className="text-xl text-zinc-100">By server</h2>
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900/80 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Server</th>
                    <th className="px-3 py-2 text-right">Level</th>
                    <th className="px-3 py-2 text-right">XP</th>
                    <th className="px-3 py-2 text-right">Kills</th>
                    <th className="px-3 py-2 text-right">K/D</th>
                    <th className="px-3 py-2 text-right">Matches</th>
                    <th className="px-3 py-2 text-right">Wins</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {overall.servers.map((server) => (
                    <tr key={server.slug} className="bg-zinc-900/40">
                      <td className="px-3 py-2">
                        <Link
                          href={`${serverPath(server.slug, `/players/${encodeURIComponent(steamId)}`)}?${new URLSearchParams({ season: seasonScopeParam(scope) })}`}
                          className="text-brand-gold-500 hover:underline"
                        >
                          {server.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-200">Lv {server.level}</td>
                      <td className="px-3 py-2 text-right text-zinc-200">{server.xp.toLocaleString("en-US")}</td>
                      <td className="px-3 py-2 text-right text-zinc-200">{server.kills}</td>
                      <td className="px-3 py-2 text-right text-zinc-200">{server.kd.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right text-zinc-200">{server.matchesPlayed}</td>
                      <td className="px-3 py-2 text-right text-zinc-200">{server.matchesWon}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <AchievementBadges achievements={steamProfile?.achievements ?? []} />
    </div>
  );
}
