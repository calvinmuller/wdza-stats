import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { safeReturnPath, verifySteamAssertion } from "@/lib/steam-openid";
import {
  signInVerifiedPlayer,
  siteOrigin,
  VERIFIED_PLAYER_COOKIE,
  verifiedPlayerCookieOptions,
} from "@/lib/verified-player";

// Where Steam sends the browser back after sign-in. Only a steamId Steam
// itself confirms (verifySteamAssertion) signs anyone in.
export async function GET(request: Request) {
  const origin = siteOrigin(request);
  const query = new URL(request.url).searchParams;
  const returnTo = safeReturnPath(query.get("returnTo"));

  const steamId = await verifySteamAssertion(query, `${origin}/api/steam/callback`);
  if (!steamId) {
    const failed = new URL(returnTo, origin);
    failed.searchParams.set("steamSignIn", "failed");
    return NextResponse.redirect(failed, 303);
  }

  const { token, expiresAt } = await signInVerifiedPlayer(db, steamId);
  const response = NextResponse.redirect(new URL(returnTo, origin), 303);
  response.cookies.set(VERIFIED_PLAYER_COOKIE, token, verifiedPlayerCookieOptions(expiresAt));
  return response;
}
