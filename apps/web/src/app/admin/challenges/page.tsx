import { requireStaffPage } from "@/lib/require-staff";
import { db } from "@/lib/db";
import { describeChallenge } from "@/lib/active-challenges";
import { listChallengeDefinitions } from "@/lib/admin-config";
import { updateChallengeDefinitionAction } from "../actions";
import { AdminShell, buttonClass, inputClass, labelClass, rowClass } from "../admin-shell";

export const dynamic = "force-dynamic";

export default async function Page() {
  const staff = await requireStaffPage("admin");
  const challengeDefinitionRows = await listChallengeDefinitions(db);

  return (
    <AdminShell staff={staff} title="Challenges" description="Daily challenge targets and XP rewards.">
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
    </AdminShell>
  );
}
