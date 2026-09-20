"use server";

import { revalidatePath } from "next/cache";
import { STAFF_ROLES, type StaffRole } from "@wdza-stats/db";
import type { ActionFormState } from "@/components/action-form";
import { staffMembers } from "@wdza-stats/db";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireStaffAction } from "@/lib/require-staff";
import { recordStaffAction } from "@/lib/staff-audit";
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
  const staff = await requireStaffAction("admin");
  const email = text(formData, "email").trim().toLowerCase();
  const chosenRole = role(formData);
  const result = await addStaffMember(db, {
    email,
    name: text(formData, "name"),
    role: chosenRole,
    temporaryPassword: text(formData, "temporaryPassword"),
  });
  if (result.ok) {
    await recordStaffAction(db, staff, "add_staff_member", { target: email, detail: { role: chosenRole } });
  }
  return done(result);
}

export async function changeStaffRoleAction(
  staffMemberId: string,
  _previous: ActionFormState,
  formData: FormData,
): Promise<ActionFormState> {
  const staff = await requireStaffAction("admin");
  const chosenRole = role(formData);
  const result = await changeStaffRole(db, staffMemberId, chosenRole);
  if (result.ok) {
    await recordStaffAction(db, staff, "change_staff_role", { target: staffMemberId, detail: { role: chosenRole } });
  }
  return done(result);
}

export async function resetStaffPasswordAction(
  staffMemberId: string,
  _previous: ActionFormState,
  formData: FormData,
): Promise<ActionFormState> {
  const staff = await requireStaffAction("admin");
  const result = await setTemporaryPassword(db, staffMemberId, text(formData, "temporaryPassword"));
  // Only that it happened: the password an admin chose is never recorded.
  if (result.ok) await recordStaffAction(db, staff, "reset_staff_password", { target: staffMemberId });
  return done(result);
}

export async function removeStaffMemberAction(
  staffMemberId: string,
  _previous: ActionFormState,
  _formData: FormData,
): Promise<ActionFormState> {
  const staff = await requireStaffAction("admin");
  // Read the email first: once removed there is nothing left to say who it was.
  const [target] = await db
    .select({ email: staffMembers.email })
    .from(staffMembers)
    .where(eq(staffMembers.id, staffMemberId));
  const result = await removeStaffMember(db, staffMemberId);
  if (result.ok) {
    await recordStaffAction(db, staff, "remove_staff_member", {
      target: staffMemberId,
      detail: { email: target?.email ?? null },
    });
  }
  return done(result);
}
