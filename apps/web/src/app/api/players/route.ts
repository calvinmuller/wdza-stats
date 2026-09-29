import { db } from "@/lib/db";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import {
  getPlayerDetails,
  MAX_BULK_STEAM_IDS,
  parseSteamIdList,
} from "@/lib/player-progression";

// Bulk player lookup: `?steamIds=1,2,3` returns each player's progression,
// stats, Achievements, Challenge progress and Steam achievements in one call.
export async function GET(request: Request) {
  const steamIds = parseSteamIdList(new URL(request.url).searchParams.get("steamIds"));

  if (steamIds.length === 0) {
    return Response.json(
      { error: "Pass a comma-separated list of steamIds as ?steamIds=" },
      { status: 400 },
    );
  }

  if (steamIds.length > MAX_BULK_STEAM_IDS) {
    return Response.json(
      { error: `At most ${MAX_BULK_STEAM_IDS} steamIds per request` },
      { status: 400 },
    );
  }

  try {
    return Response.json(await getPlayerDetails(db, CONFIGURED_SERVER_BASE_URL, steamIds));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
