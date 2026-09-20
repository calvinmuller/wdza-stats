import Link from "next/link";
import { STAFF_ROLES } from "@wdza-stats/db";
import { ActionForm } from "@/components/action-form";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format-date";
import { requireStaffPage } from "@/lib/require-staff";
import { listStaffMembers } from "@/lib/staff-management";
import {
  addStaffMemberAction,
  changeStaffRoleAction,
  removeStaffMemberAction,
  resetStaffPasswordAction,
} from "./actions";

export const dynamic = "force-dynamic";

const inputClass =
  "rounded-lg border border-white/10 bg-zinc-900/60 px-2 py-1.5 text-sm text-zinc-100 focus:border-brand-gold-500 focus:outline-none";
const buttonClass =
  "shrink-0 rounded-lg bg-brand-green-700 px-3 py-1.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-brand-green-600";
const dangerClass =
  "shrink-0 rounded-lg border border-red-500/40 px-3 py-1.5 text-sm text-red-300 transition-colors hover:bg-red-500/10";
const rowClass = "flex flex-wrap items-end gap-3 rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-3";
const labelClass = "flex flex-col gap-1 text-xs text-zinc-500";

export default async function StaffPage() {
  // Admin-only: managing who can sign in and what they may do.
  const me = await requireStaffPage("admin");
  const staff = await listStaffMembers(db);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <Link href="/admin" className="text-xs text-zinc-500 hover:text-zinc-300">
          &larr; Admin
        </Link>
        <h1 className="text-3xl">Staff</h1>
        <p className="max-w-2xl text-xs text-zinc-500">
          Staff Members sign in with an email and password. A password you set here is temporary: they must replace it
          at their next sign-in. There is no self-service reset, so a lost password is fixed here.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-zinc-100">Add a Staff Member</h2>
        <ActionForm action={addStaffMemberAction} className={rowClass} successMessage="Staff Member added.">
          <label className={labelClass}>
            Name
            <input name="name" required autoComplete="off" className={inputClass} />
          </label>
          <label className={labelClass}>
            Email
            <input name="email" type="email" required autoComplete="off" className={inputClass} />
          </label>
          <label className={labelClass}>
            Role
            <select name="role" defaultValue="moderator" className={inputClass}>
              {STAFF_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Temporary password
            <input name="temporaryPassword" type="text" required minLength={8} autoComplete="off" className={inputClass} />
          </label>
          <button type="submit" className={buttonClass}>
            Add
          </button>
        </ActionForm>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-zinc-100">Staff Members</h2>
        {staff.map((member) => (
          <div key={member.id} className="flex flex-col gap-3 rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-zinc-100">{member.name}</span>
              <span className="text-sm text-zinc-400">{member.email}</span>
              {member.id === me.id && <span className="text-xs text-zinc-500">(you)</span>}
              {member.mustChangePassword && (
                <span className="text-xs text-brand-gold-500">temporary password, not yet changed</span>
              )}
              <span className="text-xs text-zinc-600">added {formatDateTime(member.createdAt.toISOString())}</span>
            </div>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <ActionForm
                action={changeStaffRoleAction.bind(null, member.id)}
                className="flex flex-wrap items-end gap-2"
                successMessage="Role changed."
              >
                <label className={labelClass}>
                  Role
                  <select name="role" defaultValue={member.role} className={inputClass}>
                    {STAFF_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className={buttonClass}>
                  Save role
                </button>
              </ActionForm>
              <ActionForm
                action={resetStaffPasswordAction.bind(null, member.id)}
                className="flex flex-wrap items-end gap-2"
                successMessage="Password set. They are signed out and must change it."
                confirm="Set a new temporary password? They will be signed out everywhere."
              >
                <label className={labelClass}>
                  New temporary password
                  <input name="temporaryPassword" type="text" required minLength={8} autoComplete="off" className={inputClass} />
                </label>
                <button type="submit" className={buttonClass}>
                  Reset password
                </button>
              </ActionForm>
              <ActionForm
                action={removeStaffMemberAction.bind(null, member.id)}
                className="flex flex-wrap items-end gap-2"
                confirm={`Remove ${member.email}? They are signed out and can no longer sign in.`}
              >
                <button type="submit" className={dangerClass}>
                  Remove
                </button>
              </ActionForm>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
