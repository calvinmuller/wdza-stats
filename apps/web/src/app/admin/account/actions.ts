"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireStaffAction } from "@/lib/require-staff";
import { unlinkOwnSteamId } from "@/lib/staff-steam-link";

// Linking happens only through Steam sign-in (app/api/steam/staff-link);
// unlinking needs no proof, and only ever touches the caller's own record.
export async function unlinkOwnSteamIdAction(): Promise<void> {
  const staff = await requireStaffAction("moderator");
  await unlinkOwnSteamId(db, staff);
  redirect("/admin/account");
}
