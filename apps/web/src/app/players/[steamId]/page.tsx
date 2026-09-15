import { AchievementBadges } from "@/components/achievement-badges";
import { FactionSwatch } from "@/components/faction-swatch";
import { PlayerMatchHistoryTable } from "@/components/player-match-history-table";
import { SteamAvatar } from "@/components/steam-avatar";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format-date";
import { formatPlaytimeHours } from "@/lib/format-playtime";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { getPlayerMatchHistory } from "@/lib/match-history";
import {
  getPlayerAchievements,
  getPlayerChallengeProgress,
  getPlayerProgression,
  getPlayerStats,
} from "@/lib/player-progression";
import { getPlayerNotifications } from "@/lib/recent-notifications";
import { getServerByBaseUrl } from "@/lib/server-lookup";
import { getSteamProfile } from "@/lib/steam-profile-lookup";

// A DB read via drizzle isn't a Request-time API, so Next won't otherwise
// know this route needs fresh data on every request - force it dynamic so
// visitors always see current totals.
export const dynamic = "force-dynamic";

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ steamId: string }>;
}) {
  const { steamId } = await params;
  const progression = await getPlayerProgression(db, CONFIGURED_SERVER_BASE_URL, steamId);

  if (!progression) {
    return <p className="text-zinc-400">No player found with that Steam ID.</p>;
  }

  const server = await getServerByBaseUrl(db, CONFIGURED_SERVER_BASE_URL);

  const [playerStats, achievements, challenges, matchHistory, recentEvents, steamProfile] =
    await Promise.all([
      getPlayerStats(db, CONFIGURED_SERVER_BASE_URL, steamId),
      getPlayerAchievements(db, CONFIGURED_SERVER_BASE_URL, steamId),
      getPlayerChallengeProgress(db, CONFIGURED_SERVER_BASE_URL, steamId),
      getPlayerMatchHistory(db, CONFIGURED_SERVER_BASE_URL, steamId),
      server ? getPlayerNotifications(db, server.id, steamId) : Promise.resolve([]),
      getSteamProfile(db, steamId),
    ]);

  const stats = playerStats
    ? [
        { label: "Kills", value: playerStats.kills },
        { label: "Deaths", value: playerStats.deaths },
        { label: "K/D", value: playerStats.kd.toFixed(2) },
        { label: "Cash", value: playerStats.cash },
        { label: "Matches played", value: playerStats.matchesPlayed },
        { label: "Matches won", value: playerStats.matchesWon },
        { label: "Matches lost", value: playerStats.matchesLost },
        { label: "Highest kill streak", value: playerStats.highestKillStreak },
        { label: "MVP count", value: playerStats.mvpCount },
        ...(steamProfile?.playtimeMinutes != null
          ? [{ label: "Playtime", value: formatPlaytimeHours(steamProfile.playtimeMinutes) }]
          : []),
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="flex flex-wrap items-center gap-x-4 gap-y-1 text-3xl">
        <span className="flex items-center">
          {progression.factionColor && <FactionSwatch color={progression.factionColor} />}
          {progression.displayName}
        </span>
        <SteamAvatar
          avatarUrl={progression.avatarUrl}
          personaName={progression.personaName}
        />
      </h1>

      <div className="rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="font-display text-lg text-zinc-50">Level {progression.level}</span>
          <span className="text-xs text-zinc-500">{progression.xp.toLocaleString("en-US")} XP total</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${progression.progressPercent}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          {progression.xpRequiredForNextLevel === null
            ? "Max level reached"
            : `${progression.xpIntoLevel} / ${progression.xpRequiredForNextLevel} XP to level ${progression.level + 1}`}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-3"
          >
            <dt className="text-xs uppercase tracking-wide text-zinc-500">
              {stat.label}
            </dt>
            <dd className="font-display text-2xl text-zinc-50">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl text-zinc-100">Achievements</h2>
        {achievements.length === 0 ? (
          <p className="text-zinc-400">No achievements unlocked yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {achievements.map((achievement) => (
              <li
                key={achievement.id}
                className="rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2"
              >
                <span className="text-sm text-zinc-200">{achievement.name}</span>
                <p className="text-xs text-zinc-400">{achievement.description}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl text-zinc-100">Today&apos;s challenges</h2>
        {challenges.length === 0 ? (
          <p className="text-zinc-400">No active challenges right now.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {challenges.map((challenge) => (
              <li
                key={challenge.instanceId}
                className="rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-3"
              >
                <p className="text-sm font-medium text-zinc-200">{challenge.description}</p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{
                      width: `${Math.min(100, (challenge.progress / challenge.target) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {challenge.completed
                    ? "Completed"
                    : `${challenge.progress} / ${challenge.target}`}{" "}
                  &middot; +{challenge.xpReward} XP
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AchievementBadges achievements={steamProfile?.achievements ?? []} />

      <div className="flex flex-col gap-3">
        <h2 className="text-xl text-zinc-100">Recent events</h2>
        {recentEvents.length === 0 ? (
          <p className="text-zinc-400">Nothing noteworthy has happened yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recentEvents.map((event) => (
              <li key={event.id} className="text-sm text-zinc-300">
                <span className="text-xs text-zinc-500">{formatDateTime(event.timestamp)}</span>{" "}
                {event.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl text-zinc-100">Match history</h2>
        {matchHistory.length === 0 ? (
          <p className="text-zinc-400">No completed matches yet.</p>
        ) : (
          <PlayerMatchHistoryTable matches={matchHistory} />
        )}
      </div>
    </div>
  );
}
