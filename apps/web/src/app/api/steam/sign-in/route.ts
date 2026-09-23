import { beginSteamSignIn } from "@/lib/steam-sign-in-flow";

// Starts Verified Player sign-in with Steam (see lib/steam-sign-in-flow.ts).
// ?returnTo= is where the player lands afterwards.
export async function GET(request: Request) {
  return beginSteamSignIn(request, "/api/steam/callback", new URL(request.url).searchParams.get("returnTo"));
}
