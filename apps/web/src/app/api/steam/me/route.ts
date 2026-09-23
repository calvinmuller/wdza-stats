import { getCurrentVerifiedPlayerSteamId } from "@/lib/current-verified-player";

// The header's sign-in state, fetched client-side so the root layout never
// reads cookies (which would make every page dynamic).
export async function GET() {
  const steamId = await getCurrentVerifiedPlayerSteamId();
  return Response.json({ steamId }, { headers: { "cache-control": "no-store" } });
}
