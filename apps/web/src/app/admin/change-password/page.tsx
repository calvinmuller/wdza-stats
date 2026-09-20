import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { SignOutButton } from "@/components/sign-out-button";
import { getCurrentStaff, SIGN_IN_PATH } from "@/lib/require-staff";
import { changePasswordAction } from "./actions";

export const dynamic = "force-dynamic";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-zinc-900/60 px-2 py-1.5 text-sm text-zinc-100 focus:border-brand-gold-500 focus:outline-none";
const labelClass = "flex flex-col gap-1 text-xs text-zinc-500";
const buttonClass =
  "self-start rounded-lg bg-brand-green-700 px-3 py-1.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-brand-green-600";

// Where a Staff Member lands after an admin set their password: nothing else in
// the admin area works until they've picked their own. Also open to anyone
// signed in who simply wants to change theirs.
export default async function ChangePasswordPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect(SIGN_IN_PATH);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold text-zinc-50">Change your password</h1>
      {staff.mustChangePassword && (
        <p className="text-sm text-zinc-400">
          An admin set your current password. Choose your own before you continue.
        </p>
      )}
      <ActionForm action={changePasswordAction} className="flex max-w-sm flex-col gap-3">
        <label className={labelClass}>
          Current password
          <input name="currentPassword" type="password" required autoComplete="current-password" className={inputClass} />
        </label>
        <label className={labelClass}>
          New password
          <input name="newPassword" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
        </label>
        <button type="submit" className={buttonClass}>
          Change password
        </button>
      </ActionForm>
      <SignOutButton className="self-start text-xs text-zinc-500 hover:text-zinc-300" />
    </main>
  );
}
