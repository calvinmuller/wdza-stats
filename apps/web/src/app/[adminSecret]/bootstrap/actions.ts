"use server";

import { notFound } from "next/navigation";
import { ADMIN_PATH_SECRET } from "@/lib/admin-secret";
import { db } from "@/lib/db";
import { createFirstAdmin, resetAdminPassword, type BootstrapResult } from "@/lib/staff-bootstrap";

// Server Actions are their own POST endpoints, so each re-checks the secret
// itself. `secret` is bound in from the page's route param, not read from
// form input.
function assertSecret(secret: string): void {
  if (secret !== ADMIN_PATH_SECRET) notFound();
}

export type BootstrapState = BootstrapResult | null;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function createFirstAdminAction(
  secret: string,
  _previous: BootstrapState,
  formData: FormData,
): Promise<BootstrapState> {
  assertSecret(secret);
  return createFirstAdmin(db, {
    email: field(formData, "email"),
    name: field(formData, "name"),
    password: field(formData, "password"),
  });
}

export async function resetAdminPasswordAction(
  secret: string,
  _previous: BootstrapState,
  formData: FormData,
): Promise<BootstrapState> {
  assertSecret(secret);
  return resetAdminPassword(db, { email: field(formData, "email"), password: field(formData, "password") });
}
