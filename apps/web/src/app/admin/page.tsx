import { describeChallenge } from "@/lib/active-challenges";
import {
  getNotificationSettings,
  listAchievementDefinitions,
  listBannedPlayers,
  listChallengeDefinitions,
  listLevelThresholds,
  listNotificationRules,
  listXpRewards,
} from "@/lib/admin-config";
import { SignOutButton } from "@/components/sign-out-button";
import { requireStaffPage } from "@/lib/require-staff";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format-date";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { getServerByBaseUrl } from "@/lib/server-lookup";
import {
  banPlayerAction,
  generateFeedTokenAction,
  unbanPlayerAction,
  updateAchievementDefinitionAction,
  updateChallengeDefinitionAction,
  updateLevelThresholdAction,
  updateNotificationRuleAction,
  updateNotificationSettingsAction,
  updateXpRewardAction,
} from "./actions";
import { FeedTokenForm } from "./feed-token-form";

// A DB read via drizzle isn't a Request-time API, so Next won't otherwise
// know this route needs fresh data on every request - force it dynamic so
// edits are visible immediately on the next load, matching every other page.
export const dynamic = "force-dynamic";

const inputClass =
  "w-28 rounded-lg border border-white/10 bg-zinc-900/60 px-2 py-1.5 text-sm text-zinc-100 focus:border-brand-gold-500 focus:outline-none";
const textInputClass =
  "w-full rounded-lg border border-white/10 bg-zinc-900/60 px-2 py-1.5 text-sm text-zinc-100 focus:border-brand-gold-500 focus:outline-none";
const buttonClass =
  "shrink-0 rounded-lg bg-brand-green-700 px-3 py-1.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-brand-green-600";
const rowClass = "flex flex-wrap items-end gap-3 rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-3";
const labelClass = "flex flex-col gap-1 text-xs text-zinc-500";

export default async function AdminPage() {
  // Render-time gating alone isn't a security boundary (see actions.ts's own
  // re-check), but it is what keeps this area unreachable, and unadvertised,
  // for anyone who isn't a signed-in admin: they get the same 404 as any
  // unknown URL. (Ticket 06 lets moderators in for the ban screens.)
  const staff = await requireStaffPage("admin");

  const [
    xpRewardRows,
    levelThresholdRows,
    challengeDefinitionRows,
    achievementDefinitionRows,
    notificationRuleRows,
    notificationSettingsRow,
    bannedPlayerRows,
  ] = await Promise.all([
    listXpRewards(db),
    listLevelThresholds(db),
    listChallengeDefinitions(db),
    listAchievementDefinitions(db),
    listNotificationRules(db),
    getNotificationSettings(db),
    listBannedPlayers(db),
  ]);
  const feedServer = await getServerByBaseUrl(db, CONFIGURED_SERVER_BASE_URL);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl">Admin</h1>
          <p className="max-w-2xl text-xs text-zinc-500">
            Edit gamification config. Changes apply on the next poll - no redeploy required.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span>{staff.email}</span>
          <SignOutButton className="rounded-lg border border-white/10 px-2 py-1 text-zinc-300 hover:bg-white/5" />
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-zinc-100">XP rewards</h2>
        <div className="flex flex-col gap-2">
          {xpRewardRows.map((reward) => (
            <form
              key={reward.reason}
              action={updateXpRewardAction.bind(null, reward.reason)}
              className={rowClass}
            >
              <span className="min-w-32 font-medium text-zinc-200">{reward.reason}</span>
              <label className={labelClass}>
                Amount
                <input type="number" name="amount" min={0} step={1} defaultValue={reward.amount} className={inputClass} />
              </label>
              <button type="submit" className={buttonClass}>
                Save
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-zinc-100">Level curve</h2>
        <div className="flex flex-col gap-2">
          {levelThresholdRows.map((threshold) => (
            <form
              key={threshold.level}
              action={updateLevelThresholdAction.bind(null, threshold.level)}
              className={rowClass}
            >
              <span className="min-w-32 font-medium text-zinc-200">Level {threshold.level}</span>
              <label className={labelClass}>
                XP required
                <input
                  type="number"
                  name="xpRequired"
                  min={0}
                  step={1}
                  defaultValue={threshold.xpRequired}
                  className={inputClass}
                />
              </label>
              <button type="submit" className={buttonClass}>
                Save
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-zinc-100">Daily challenges</h2>
        <div className="flex flex-col gap-2">
          {challengeDefinitionRows.map((definition) => (
            <form
              key={definition.id}
              action={updateChallengeDefinitionAction.bind(null, definition.id)}
              className={rowClass}
            >
              <span className="min-w-48 font-medium text-zinc-200">
                {describeChallenge(definition.type, definition.target)}
              </span>
              <label className={labelClass}>
                Target
                <input type="number" name="target" min={0} step={1} defaultValue={definition.target} className={inputClass} />
              </label>
              <label className={labelClass}>
                XP reward
                <input
                  type="number"
                  name="xpReward"
                  min={0}
                  step={1}
                  defaultValue={definition.xpReward}
                  className={inputClass}
                />
              </label>
              <button type="submit" className={buttonClass}>
                Save
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-zinc-100">Achievements</h2>
        <div className="flex flex-col gap-2">
          {achievementDefinitionRows.map((achievement) => (
            <form
              key={achievement.id}
              action={updateAchievementDefinitionAction.bind(null, achievement.id)}
              className={rowClass}
            >
              <span className="min-w-28 text-xs text-zinc-500">{achievement.trigger}</span>
              <label className={`${labelClass} min-w-40 flex-1`}>
                Name
                <input type="text" name="name" defaultValue={achievement.name} className={textInputClass} />
              </label>
              <label className={`${labelClass} min-w-48 flex-[2]`}>
                Description
                <input
                  type="text"
                  name="description"
                  defaultValue={achievement.description}
                  className={textInputClass}
                />
              </label>
              <label className={labelClass}>
                Threshold
                <input
                  type="number"
                  name="threshold"
                  min={0}
                  step={1}
                  defaultValue={achievement.threshold}
                  className={inputClass}
                />
              </label>
              <button type="submit" className={buttonClass}>
                Save
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-zinc-100">Notification rules</h2>
        <div className="flex flex-col gap-2">
          {notificationRuleRows.map((rule) => (
            <form
              key={rule.kind}
              action={updateNotificationRuleAction.bind(null, rule.kind)}
              className={rowClass}
            >
              <span className="min-w-40 font-medium text-zinc-200">{rule.kind}</span>
              <label className={labelClass}>
                Priority
                <select name="priority" defaultValue={rule.priority} className={inputClass}>
                  <option value="low">low</option>
                  <option value="normal">normal</option>
                  <option value="high">high</option>
                </select>
              </label>
              <label className={`${labelClass} min-w-64 flex-1`}>
                Template
                <input type="text" name="template" defaultValue={rule.template} className={textInputClass} />
              </label>
              <button type="submit" className={buttonClass}>
                Save
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-zinc-100">Notification settings</h2>
        <form action={updateNotificationSettingsAction} className={rowClass}>
          <label className={labelClass}>
            Max low/normal notifications per minute
            <input
              type="number"
              name="maxLowNormalPerMinute"
              min={0}
              step={1}
              defaultValue={notificationSettingsRow.maxLowNormalPerMinute}
              className={inputClass}
            />
          </label>
          <button type="submit" className={buttonClass}>
            Save
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-zinc-100">Banned players</h2>
        <p className="max-w-2xl text-xs text-zinc-500">
          A banned Steam ID is ignored everywhere: it never shows on the leaderboard, rankings,
          server stats, player search, or the live snapshot, and the Worker stops updating its
          stats on the next poll.
        </p>

        <div className="flex flex-col gap-2">
          {bannedPlayerRows.length === 0 ? (
            <p className="text-sm text-zinc-500">No players are banned.</p>
          ) : (
            bannedPlayerRows.map((banned) => (
              <div key={banned.steamId} className={rowClass}>
                <span className="min-w-40 font-medium text-zinc-200">{banned.steamId}</span>
                <span className="flex-1 text-sm text-zinc-400">{banned.reason ?? "—"}</span>
                <span className="text-xs text-zinc-500">
                  Banned {formatDateTime(banned.bannedAt.toISOString())}
                </span>
                <form action={unbanPlayerAction.bind(null, banned.steamId)}>
                  <button
                    type="submit"
                    className="shrink-0 rounded-lg bg-red-900/60 px-3 py-1.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-red-800/60"
                  >
                    Unban
                  </button>
                </form>
              </div>
            ))
          )}
        </div>

        <form action={banPlayerAction} className={rowClass}>
          <label className={`${labelClass} min-w-40 flex-1`}>
            Steam ID
            <input type="text" name="steamId" required className={textInputClass} />
          </label>
          <label className={`${labelClass} min-w-48 flex-[2]`}>
            Reason (optional)
            <input type="text" name="reason" className={textInputClass} />
          </label>
          <button type="submit" className={buttonClass}>
            Ban
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-zinc-100">Kill feed</h2>
        {feedServer ? (
          <FeedTokenForm
            action={generateFeedTokenAction}
            hasToken={feedServer.feedTokenHash !== null}
          />
        ) : (
          <p className="text-sm text-zinc-400">
            No Server is registered yet - the Worker creates it on its first poll.
          </p>
        )}
      </section>
    </div>
  );
}
