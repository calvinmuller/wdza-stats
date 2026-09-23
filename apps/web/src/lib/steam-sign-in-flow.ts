import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { buildSteamSignInUrl, safeReturnPath, verifySteamAssertion } from "./steam-openid";
import { siteOrigin } from "./verified-player";

// The round trip to Steam and back, shared by Verified Player sign-in and a
// Staff Member linking their steamId. Each start sets a short-lived random
// state in a cookie and in the return URL Steam signs; the callback only
// accepts a sign-in whose state matches this browser's cookie. Without it,
// someone could complete a Steam sign-in themselves, hold on to the unused
// callback URL, and get another person to open it - signing them in as, or
// linking their staff record to, the attacker's steamId.

const STATE_COOKIE = "wdza_steam_state";
const STATE_MAX_AGE_SECONDS = 10 * 60;

/** Sends the browser to Steam, to come back to `callbackPath` and then `returnTo`. */
export function beginSteamSignIn(request: Request, callbackPath: string, returnTo: string | null): NextResponse {
  const origin = siteOrigin(request);
  const state = randomBytes(16).toString("base64url");
  const callback = `${origin}${callbackPath}?${new URLSearchParams({ returnTo: safeReturnPath(returnTo), state })}`;

  const response = NextResponse.redirect(buildSteamSignInUrl(origin, callback));
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: STATE_MAX_AGE_SECONDS,
    path: "/api/steam",
  });
  return response;
}

/**
 * The steamId Steam vouches for on this callback, or null when it isn't a
 * genuine sign-in this browser started; plus where to send the browser next.
 * Pair with `endSteamSignIn` on whatever response follows.
 */
export async function completeSteamSignIn(
  request: NextRequest,
  callbackPath: string,
): Promise<{ steamId: string | null; returnTo: string }> {
  const query = request.nextUrl.searchParams;
  // Read our own parameters from the return URL Steam signed, not the outer
  // query string, which anyone can append to.
  const signedReturnTo = parseUrl(query.get("openid.return_to"));
  const returnTo = safeReturnPath(signedReturnTo?.searchParams.get("returnTo") ?? query.get("returnTo"));

  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  const state = signedReturnTo?.searchParams.get("state");
  if (!expectedState || !state || !sameText(state, expectedState)) return { steamId: null, returnTo };

  const steamId = await verifySteamAssertion(query, `${siteOrigin(request)}${callbackPath}`);
  return { steamId, returnTo };
}

/** Clears the one-use state cookie; call on every callback response. */
export function endSteamSignIn(response: NextResponse): NextResponse {
  response.cookies.set(STATE_COOKIE, "", { maxAge: 0, path: "/api/steam" });
  return response;
}

function parseUrl(url: string | null): URL | null {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
