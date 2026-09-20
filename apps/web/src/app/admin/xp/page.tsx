import { requireStaffPage } from "@/lib/require-staff";
import { db } from "@/lib/db";
import { listLevelThresholds, listXpRewards } from "@/lib/admin-config";
import { updateLevelThresholdAction, updateXpRewardAction } from "../actions";
import { AdminShell, buttonClass, inputClass, labelClass, rowClass } from "../admin-shell";

export const dynamic = "force-dynamic";

export default async function Page() {
  const staff = await requireStaffPage("admin");
  const [xpRewardRows, levelThresholdRows] = await Promise.all([listXpRewards(db), listLevelThresholds(db)]);

  return (
    <AdminShell staff={staff} title="XP & Levels" description="XP awarded per event and the level curve. Changes apply on the next poll.">
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
    </AdminShell>
  );
}
