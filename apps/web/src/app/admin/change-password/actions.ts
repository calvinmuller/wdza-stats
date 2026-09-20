"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionFormState } from "@/components/action-form";
import { db } from "@/lib/db";
import { getCurrentStaff } from "@/lib/require-staff";
import { recordStaffAction } from "@/lib/staff-audit";
import { changeOwnPassword } from "@/lib/staff-management";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

// Deliberately not requireStaffAction: a Staff Member who must change their
// password is blocked from everything else, and this is the way out. Any
// signed-in Staff Member may change their own password.
export async function changePasswordAction(_previous: ActionFormState, formData: FormData): Promise<ActionFormState> {
  const staff = await getCurrentStaff();
  if (!staff) throw new Error("Forbidden");
  const result = await changeOwnPassword(db, {
    headers: await headers(),
    staffMemberId: staff.id,
    currentPassword: text(formData, "currentPassword"),
    newPassword: text(formData, "newPassword"),
  });
  if (result.ok) {
    await recordStaffAction(db, staff, "change_own_password", { target: staff.id });
    redirect("/admin");
  }
  return result;
}
