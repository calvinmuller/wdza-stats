import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { hasRole, type CurrentStaff } from "@/lib/require-staff";
import { AdminNav } from "./admin-nav";

export const inputClass =
  "w-28 rounded-lg border border-white/10 bg-zinc-900/60 px-2 py-1.5 text-sm text-zinc-100 focus:border-brand-gold-500 focus:outline-none";
export const textInputClass =
  "w-full rounded-lg border border-white/10 bg-zinc-900/60 px-2 py-1.5 text-sm text-zinc-100 focus:border-brand-gold-500 focus:outline-none";
export const buttonClass =
  "shrink-0 rounded-lg bg-brand-green-700 px-3 py-1.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-brand-green-600";
export const dangerButtonClass =
  "shrink-0 rounded-lg bg-red-900/60 px-3 py-1.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-red-800/60";
export const rowClass = "flex flex-wrap items-end gap-3 rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-3";
export const labelClass = "flex flex-col gap-1 text-xs text-zinc-500";

// The frame every admin page shares: who is signed in, the section sub nav,
// then the page's own title and content. Each page calls requireStaffPage
// itself and passes the result in, so the gating stays next to the page.
export function AdminShell({
  staff,
  title,
  description,
  children,
}: {
  staff: CurrentStaff;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const isAdmin = hasRole(staff, "admin");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-display text-lg text-zinc-100">Admin</span>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span>{staff.email}</span>
          <Link href="/admin/account" className="text-zinc-300 hover:text-zinc-100">
            Steam account
          </Link>
          <Link href="/admin/change-password" className="text-zinc-300 hover:text-zinc-100">
            Change password
          </Link>
          <SignOutButton className="rounded-lg border border-white/10 px-2 py-1 text-zinc-300 hover:bg-white/5" />
        </div>
      </div>

      <AdminNav isAdmin={isAdmin} />

      <div className="flex flex-col gap-10">
        <div>
          <h1 className="text-3xl">{title}</h1>
          {description && <p className="max-w-2xl text-xs text-zinc-500">{description}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
