import { NextResponse } from "next/server";
import { getCurrentStaff, SIGN_IN_PATH } from "@/lib/require-staff";
import { beginSteamSignIn } from "@/lib/steam-sign-in-flow";
import { siteOrigin } from "@/lib/verified-player";

// Starts a signed-in Staff Member linking their own steamId (lib/staff-steam-link.ts).
export async function GET(request: Request) {
  const staff = await getCurrentStaff();
  if (!staff || staff.mustChangePassword) {
    return NextResponse.redirect(new URL(SIGN_IN_PATH, siteOrigin(request)));
  }
  return beginSteamSignIn(request, "/api/steam/staff-link/callback", "/admin/account");
}
