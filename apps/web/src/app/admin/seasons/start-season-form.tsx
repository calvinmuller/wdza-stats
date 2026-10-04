"use client";

import { useState } from "react";
import { ActionForm, type ActionFormState } from "@/components/action-form";
import { buttonClass, labelClass, rowClass, textInputClass } from "../admin-shell";

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
