"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-zinc-900/60 px-2 py-1.5 text-sm text-zinc-100 focus:border-brand-gold-500 focus:outline-none";
const labelClass = "flex flex-col gap-1 text-xs text-zinc-500";
const buttonClass =
  "self-start rounded-lg bg-brand-green-700 px-3 py-1.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-brand-green-600 disabled:opacity-50";

// Deliberately says the same thing for an unknown email and a wrong password.
const GENERIC_ERROR = "Wrong email or password.";
const RATE_LIMITED = "Too many attempts. Wait a minute and try again.";

export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="flex max-w-sm flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setPending(true);
        setError(null);
        const { error: failure } = await authClient.signIn.email({
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
        });
        if (failure) {
          setError(failure.status === 429 ? RATE_LIMITED : GENERIC_ERROR);
          setPending(false);
          return;
        }
        router.replace("/admin");
        router.refresh();
      }}
    >
      <label className={labelClass}>
        Email
        <input name="email" type="email" required autoComplete="username" className={inputClass} />
      </label>
      <label className={labelClass}>
        Password
        <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        Sign in
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
