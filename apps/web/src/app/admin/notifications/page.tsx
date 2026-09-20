import { requireStaffPage } from "@/lib/require-staff";
import { db } from "@/lib/db";
import { getNotificationSettings, listNotificationRules } from "@/lib/admin-config";
import { updateNotificationRuleAction, updateNotificationSettingsAction } from "../actions";
import { AdminShell, buttonClass, inputClass, labelClass, rowClass, textInputClass } from "../admin-shell";

export const dynamic = "force-dynamic";

export default async function Page() {
  const staff = await requireStaffPage("admin");
  const [notificationRuleRows, notificationSettingsRow] = await Promise.all([
    listNotificationRules(db),
    getNotificationSettings(db),
  ]);

  return (
    <AdminShell staff={staff} title="Notifications" description="Notification priority and templates, plus the rate limit.">
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
    </AdminShell>
  );
}
