"use client";

import { useActionState } from "react";
import type { BootstrapState } from "./actions";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-zinc-900/60 px-2 py-1.5 text-sm text-zinc-100 focus:border-brand-gold-500 focus:outline-none";
const labelClass = "flex flex-col gap-1 text-xs text-zinc-500";
const buttonClass =
  "self-start rounded-lg bg-brand-green-700 px-3 py-1.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-brand-green-600 disabled:opacity-50";

export function BootstrapForm({
  action,
  withName,
  submitLabel,
  successMessage,
}: {
  action: (previous: BootstrapState, formData: FormData) => Promise<BootstrapState>;
  withName: boolean;
  submitLabel: string;
  successMessage: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-3">
      {withName && (
        <label className={labelClass}>
          Name
          <input name="name" required autoComplete="name" className={inputClass} />
        </label>
      )}
      <label className={labelClass}>
        Email
        <input name="email" type="email" required autoComplete="username" className={inputClass} />
      </label>
      <label className={labelClass}>
        {withName ? "Password" : "New password"}
        <input name="password" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {submitLabel}
      </button>
      {state?.ok === true && <p className="text-sm text-brand-green-500">{successMessage}</p>}
      {state?.ok === false && <p className="text-sm text-red-400">{state.error}</p>}
    </form>
  );
}
