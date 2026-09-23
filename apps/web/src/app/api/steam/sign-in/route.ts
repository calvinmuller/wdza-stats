import { NextResponse } from "next/server";
import { buildSteamSignInUrl, safeReturnPath } from "@/lib/steam-openid";
import { siteOrigin } from "@/lib/verified-player";

// Starts Steam sign-in (see lib/steam-openid.ts). ?returnTo= is where the
// player lands afterwards; it rides along inside Steam's return URL.
export async function GET(request: Request) {
  const origin = siteOrigin(request);
  const returnTo = safeReturnPath(new URL(request.url).searchParams.get("returnTo"));
  const callback = `${origin}/api/steam/callback?${new URLSearchParams({ returnTo })}`;
  return NextResponse.redirect(buildSteamSignInUrl(origin, callback));
}
