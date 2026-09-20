import { requireStaffPage } from "@/lib/require-staff";
import { db } from "@/lib/db";
import { listAchievementDefinitions } from "@/lib/admin-config";
import { updateAchievementDefinitionAction } from "../actions";
import { AdminShell, buttonClass, inputClass, labelClass, rowClass, textInputClass } from "../admin-shell";

export const dynamic = "force-dynamic";

export default async function Page() {
  const staff = await requireStaffPage("admin");
  const achievementDefinitionRows = await listAchievementDefinitions(db);

  return (
    <AdminShell staff={staff} title="Achievements" description="Achievement names, descriptions and thresholds.">
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
    </AdminShell>
  );
}
