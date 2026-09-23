import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentStaff, SIGN_IN_PATH } from "@/lib/require-staff";
import { completeSteamSignIn, endSteamSignIn } from "@/lib/steam-sign-in-flow";
import { linkOwnSteamId } from "@/lib/staff-steam-link";
import { siteOrigin } from "@/lib/verified-player";

// Where Steam sends a Staff Member back after proving their steamId. Links it
// to their staff record only - no Verified Player, no player session.
export async function GET(request: NextRequest) {
  const origin = siteOrigin(request);
  const staff = await getCurrentStaff();
  if (!staff || staff.mustChangePassword) {
    return endSteamSignIn(NextResponse.redirect(new URL(SIGN_IN_PATH, origin), 303));
  }

  const { steamId } = await completeSteamSignIn(request, "/api/steam/staff-link/callback");
  const outcome = new URL("/admin/account", origin);
  if (!steamId) {
    outcome.searchParams.set("steamLink", "failed");
  } else {
    const result = await linkOwnSteamId(db, staff, steamId);
    outcome.searchParams.set("steamLink", result.ok ? "linked" : "taken");
  }
  return endSteamSignIn(NextResponse.redirect(outcome, 303));
}
