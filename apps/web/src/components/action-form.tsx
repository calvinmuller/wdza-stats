"use client";

import { useActionState, type ReactNode } from "react";

export type ActionFormState = { ok: true } | { ok: false; error: string } | null;

// A form whose Server Action reports success or a reason for refusal, shown
// under the fields. Plain `<form action>` would drop the error on the floor.
export function ActionForm({
  action,
  className,
  successMessage,
  confirm,
  children,
}: {
  action: (previous: ActionFormState, formData: FormData) => Promise<ActionFormState>;
  className?: string;
  successMessage?: string;
  confirm?: string;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState(action, null);

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
