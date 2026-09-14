import type { SteamAchievementView } from "@/lib/steam-profile-lookup";

// Renders nothing (not an empty-state message) when there are no unlocked
// achievements to show - a player with no cached SteamProfile, a private
// profile, or genuinely zero unlocks all look identical: the section just
// isn't there, same as the page looked before this feature existed.
export function AchievementBadges({
  achievements,
}: {
  achievements: SteamAchievementView[];
}) {
  if (achievements.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xl text-zinc-100">Steam Achievements</h2>
      <ul className="flex flex-wrap gap-3">
        {achievements.map((achievement) => (
          <li
            key={achievement.apiName}
            title={achievement.description ?? achievement.displayName}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={achievement.iconUrl}
              alt=""
              width={32}
              height={32}
              className="size-8 shrink-0 rounded"
            />
            <span className="text-sm text-zinc-200">{achievement.displayName}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
