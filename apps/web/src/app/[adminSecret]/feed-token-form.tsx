"use client";

import { useActionState, useState } from "react";
import type { FeedTokenState } from "./actions";

const buttonClass =
  "shrink-0 rounded-lg bg-brand-green-700 px-3 py-1.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-brand-green-600 disabled:opacity-50";

// Issues the Server's kill feed token. The token is shown here once, next to
// the lines the game's ServerSettings.ini needs; only its hash is stored, so a
// lost token is replaced, never recovered - and replacing it stops the old one.
export function FeedTokenForm({
  action,
  hasToken,
}: {
  action: (previous: FeedTokenState, formData: FormData) => Promise<FeedTokenState>;
  hasToken: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { token: null, error: null });
  const [copied, setCopied] = useState(false);
  const isSet = hasToken || state.token !== null;

  const config = state.token
    ? `[WDServerFeed]\nUrl=${window.location.origin}\nToken=${state.token}`
    : null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-400">
        {isSet
          ? "A kill feed token is set. It can't be shown again; generate a new one to replace it."
          : "No kill feed token yet, so the game can't send kills."}
      </p>
      <form
        action={formAction}
        onSubmit={(event) => {
          if (
            isSet &&
            !window.confirm(
              "Replace the kill feed token? The game stops sending kills until its Token is updated.",
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <button type="submit" disabled={pending} className={buttonClass}>
          {isSet ? "Regenerate token" : "Generate token"}
        </button>
      </form>
      {state.error && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}
      {config && (
        <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-zinc-900/60 p-4">
          <p className="text-xs text-zinc-500">
            Copy this into the game&apos;s ServerSettings.ini now - the token is not shown again.
          </p>
          <pre className="overflow-x-auto text-sm text-zinc-100">{config}</pre>
          <button
            type="button"
            className={`${buttonClass} self-start`}
            onClick={async () => {
              await navigator.clipboard.writeText(config);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}
