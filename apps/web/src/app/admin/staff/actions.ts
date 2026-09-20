"use server";

import { revalidatePath } from "next/cache";
import { STAFF_ROLES, type StaffRole } from "@wdza-stats/db";
import type { ActionFormState } from "@/components/action-form";
import { db } from "@/lib/db";
import { requireStaffAction } from "@/lib/require-staff";
import {
  addStaffMember,
  changeStaffRole,
  removeStaffMember,
  setTemporaryPassword,
} from "@/lib/staff-management";

// Everything here manages who can sign in and what they may do, so it is
// admin-only, and each action re-checks that itself (a Server Action is its own
// POST endpoint).

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function role(formData: FormData): StaffRole {
  const value = text(formData, "role");
  return (STAFF_ROLES as readonly string[]).includes(value) ? (value as StaffRole) : "moderator";
}

async function done(result: ActionFormState): Promise<ActionFormState> {
  if (result?.ok) revalidatePath("/admin/staff");
  return result;
}

export async function addStaffMemberAction(_previous: ActionFormState, formData: FormData): Promise<ActionFormState> {
  await requireStaffAction("admin");
  return done(
    await addStaffMember(db, {
      email: text(formData, "email"),
      name: text(formData, "name"),
      role: role(formData),
      temporaryPassword: text(formData, "temporaryPassword"),
    }),
  );
}

export async function changeStaffRoleAction(
  staffMemberId: string,
  _previous: ActionFormState,
  formData: FormData,
): Promise<ActionFormState> {
  await requireStaffAction("admin");
  return done(await changeStaffRole(db, staffMemberId, role(formData)));
}

export async function resetStaffPasswordAction(
  staffMemberId: string,
  _previous: ActionFormState,
  formData: FormData,
): Promise<ActionFormState> {
  await requireStaffAction("admin");
  return done(await setTemporaryPassword(db, staffMemberId, text(formData, "temporaryPassword")));
}

export async function removeStaffMemberAction(
  staffMemberId: string,
  _previous: ActionFormState,
  _formData: FormData,
): Promise<ActionFormState> {
  await requireStaffAction("admin");
  return done(await removeStaffMember(db, staffMemberId));
}
