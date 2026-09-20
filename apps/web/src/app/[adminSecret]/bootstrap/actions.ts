"use server";

import { notFound } from "next/navigation";
import { ADMIN_PATH_SECRET } from "@/lib/admin-secret";
import { db } from "@/lib/db";
import { recordStaffAction } from "@/lib/staff-audit";
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
  const email = field(formData, "email").trim().toLowerCase();
  const result = await createFirstAdmin(db, {
    email,
    name: field(formData, "name"),
    password: field(formData, "password"),
  });
  // Nobody is signed in here, so there is no actor: the record says it was the
  // bootstrap page.
  if (result.ok) await recordStaffAction(db, null, "bootstrap_create_admin", { target: email });
  return result;
}

export async function resetAdminPasswordAction(
  secret: string,
  _previous: BootstrapState,
  formData: FormData,
): Promise<BootstrapState> {
  assertSecret(secret);
  const email = field(formData, "email").trim().toLowerCase();
  const result = await resetAdminPassword(db, { email, password: field(formData, "password") });
  if (result.ok) await recordStaffAction(db, null, "bootstrap_reset_admin_password", { target: email });
  return result;
}
