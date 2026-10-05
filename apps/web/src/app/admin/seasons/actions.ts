"use server";

import { revalidatePath } from "next/cache";
import { startNextSeason, withdrawSeason } from "@wdza-stats/db";
import type { ActionFormState } from "@/components/action-form";
import { db } from "@/lib/db";
import { requireStaffAction } from "@/lib/require-staff";
import { recordStaffAction } from "@/lib/staff-audit";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

// Admin-only, re-checked here since a Server Action is its own POST endpoint.
// `number` is the Season the admin confirmed starting, not a choice:
// startNextSeason refuses anything but the current Season's + 1.
export async function startSeasonAction(_previous: ActionFormState, formData: FormData): Promise<ActionFormState> {
  const staff = await requireStaffAction("admin");
  const result = await startNextSeason(db, { number: Number(text(formData, "number")), name: text(formData, "name") });
  if (!result.ok) return result;

  await recordStaffAction(db, staff, "start_season", {
    target: String(result.season.number),
    detail: { name: result.season.name },
  });
  revalidatePath("/admin/seasons");
  return { ok: true };
}

// Admin-only, like starting one. `number` is the Season the admin confirmed
// withdrawing: withdrawSeason refuses anything but the current Season, and
// refuses that too once one of its Matches has closed.
export async function withdrawSeasonAction(_previous: ActionFormState, formData: FormData): Promise<ActionFormState> {
  const staff = await requireStaffAction("admin");
  const result = await withdrawSeason(db, { number: Number(text(formData, "number")) });
  if (!result.ok) return result;

  await recordStaffAction(db, staff, "withdraw_season", {
    target: String(result.season.number),
    detail: { name: result.season.name },
  });
  revalidatePath("/admin/seasons");
  return { ok: true };
}
