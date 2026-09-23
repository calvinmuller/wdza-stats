import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { safeReturnPath } from "@/lib/steam-openid";
import { signOutVerifiedPlayer, siteOrigin, VERIFIED_PLAYER_COOKIE } from "@/lib/verified-player";

// POST only, from the header's sign-out form. The cookie is SameSite=Lax, so
// another site's form can't post here with it attached.
export async function POST(request: Request) {
  const token = (await cookies()).get(VERIFIED_PLAYER_COOKIE)?.value;
  if (token) await signOutVerifiedPlayer(db, token);

  const form = await request.formData().catch(() => null);
  const returnTo = safeReturnPath(form?.get("returnTo")?.toString());
  const response = NextResponse.redirect(new URL(returnTo, siteOrigin(request)), 303);
  response.cookies.delete(VERIFIED_PLAYER_COOKIE);
  return response;
}
