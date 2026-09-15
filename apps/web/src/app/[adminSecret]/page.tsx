import { notFound } from "next/navigation";
import { describeChallenge } from "@/lib/active-challenges";
import {
  getNotificationSettings,
  listAchievementDefinitions,
  listChallengeDefinitions,
  listLevelThresholds,
  listNotificationRules,
  listXpRewards,
} from "@/lib/admin-config";
import { ADMIN_PATH_SECRET } from "@/lib/admin-secret";
import { db } from "@/lib/db";
import {
  updateAchievementDefinitionAction,
  updateChallengeDefinitionAction,
  updateLevelThresholdAction,
  updateNotificationRuleAction,
  updateNotificationSettingsAction,
  updateXpRewardAction,
} from "./actions";

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

export default async function AdminPage({
  params,
}: {
  params: Promise<{ adminSecret: string }>;
}) {
  const { adminSecret } = await params;

  // Render-time gating alone isn't a security boundary (see actions.ts's
  // own re-check), but it is what keeps this area unreachable through normal
  // navigation - see ticket 15.
  if (adminSecret !== ADMIN_PATH_SECRET) {
    notFound();
  }

  const [xpRewardRows, levelThresholdRows, challengeDefinitionRows, achievementDefinitionRows, notificationRuleRows, notificationSettingsRow] =
    await Promise.all([
      listXpRewards(db),
      listLevelThresholds(db),
      listChallengeDefinitions(db),
      listAchievementDefinitions(db),
      listNotificationRules(db),
      getNotificationSettings(db),
    ]);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-3xl">Admin</h1>
        <p className="max-w-2xl text-xs text-zinc-500">
          Edit gamification config. Changes apply on the next poll - no redeploy required.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-zinc-100">XP rewards</h2>
        <div className="flex flex-col gap-2">
          {xpRewardRows.map((reward) => (
            <form
              key={reward.reason}
              action={updateXpRewardAction.bind(null, adminSecret, reward.reason)}
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
              action={updateLevelThresholdAction.bind(null, adminSecret, threshold.level)}
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
              action={updateChallengeDefinitionAction.bind(null, adminSecret, definition.id)}
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
              action={updateAchievementDefinitionAction.bind(null, adminSecret, achievement.id)}
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
              action={updateNotificationRuleAction.bind(null, adminSecret, rule.kind)}
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
        <form action={updateNotificationSettingsAction.bind(null, adminSecret)} className={rowClass}>
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
    </div>
  );
}
