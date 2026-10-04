"use client";

import { useState } from "react";
import { ActionForm, type ActionFormState } from "@/components/action-form";

// Copies of admin-shell's classes: importing that module from a client
// component would pull its server-only imports (next/headers) into the bundle.
const textInputClass =
  "w-full rounded-lg border border-white/10 bg-zinc-900/60 px-2 py-1.5 text-sm text-zinc-100 focus:border-brand-gold-500 focus:outline-none";
const buttonClass =
  "shrink-0 rounded-lg bg-brand-green-700 px-3 py-1.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-brand-green-600";
const rowClass = "flex flex-wrap items-end gap-3 rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-3";
const labelClass = "flex flex-col gap-1 text-xs text-zinc-500";

// The confirmation names the Season exactly as it will appear, so it is built
// from the name as typed rather than fixed when the page rendered.
export function StartSeasonForm({
  action,
  number,
  nameMaxLength,
}: {
  action: (previous: ActionFormState, formData: FormData) => Promise<ActionFormState>;
  number: number;
  nameMaxLength: number;
}) {
  const [name, setName] = useState("");
  const label = name.trim() ? `Season ${number} (${name.trim()})` : `Season ${number}`;

  return (
    <ActionForm
      action={action}
      className={rowClass}
      // Not naming the number: once the page refreshes, `number` is the one after.
      successMessage="The new Season has started."
      confirm={`Start ${label} now? Every leaderboard will switch to Season ${number}. Matches already in progress finish in the current Season.`}
      onSuccess={() => setName("")}
    >
      <input type="hidden" name="number" value={number} />
      <label className={`${labelClass} min-w-48 flex-1`}>
        Name (optional)
        <input
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={nameMaxLength}
          autoComplete="off"
          className={textInputClass}
        />
      </label>
      <button type="submit" className={buttonClass}>
        Start Season {number}
      </button>
    </ActionForm>
  );
}
