import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { completeSteamSignIn, endSteamSignIn } from "@/lib/steam-sign-in-flow";
import {
  signInVerifiedPlayer,
  siteOrigin,
  VERIFIED_PLAYER_COOKIE,
  verifiedPlayerCookieOptions,
} from "@/lib/verified-player";

// Where Steam sends the browser back after Verified Player sign-in. Only a
// steamId Steam itself confirms, on a sign-in this browser started, signs
// anyone in.
export async function GET(request: NextRequest) {
  const origin = siteOrigin(request);
  const { steamId, returnTo } = await completeSteamSignIn(request, "/api/steam/callback");

  if (!steamId) {
    const failed = new URL(returnTo, origin);
    failed.searchParams.set("steamSignIn", "failed");
    return endSteamSignIn(NextResponse.redirect(failed, 303));
  }

  const { token, expiresAt } = await signInVerifiedPlayer(db, steamId);
  const response = NextResponse.redirect(new URL(returnTo, origin), 303);
  response.cookies.set(VERIFIED_PLAYER_COOKIE, token, verifiedPlayerCookieOptions(expiresAt));
  return endSteamSignIn(response);
}
