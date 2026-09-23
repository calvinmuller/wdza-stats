"use client";

import { useActionState, useEffect, type ReactNode } from "react";

export type ActionFormState = { ok: true } | { ok: false; error: string } | null;

// A form whose Server Action reports success or a reason for refusal, shown
// under the fields. Plain `<form action>` would drop the error on the floor.
export function ActionForm({
  action,
  className,
  successMessage,
  confirm,
  onSuccess,
  children,
}: {
  action: (previous: ActionFormState, formData: FormData) => Promise<ActionFormState>;
  className?: string;
  successMessage?: string;
  confirm?: string;
  // For a caller that needs to react to success beyond showing successMessage
  // (e.g. flipping local UI state) - runs once per successful submission, not
  // on every render while state stays ok.
  onSuccess?: () => void;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState(action, null);

  useEffect(() => {
    if (state?.ok === true) onSuccess?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {children}
      {state?.ok === false && <p className="basis-full text-sm text-red-400">{state.error}</p>}
      {state?.ok === true && successMessage && <p className="basis-full text-sm text-brand-green-500">{successMessage}</p>}
    </form>
  );
}
