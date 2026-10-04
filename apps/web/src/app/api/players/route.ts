import { db } from "@/lib/db";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import {
  getPlayerDetails,
  MAX_BULK_STEAM_IDS,
  parseSteamIdList,
} from "@/lib/player-progression";
import { apiSeasonScope, seasonSummary } from "@/lib/season-scope";

// Bulk player lookup: `?steamIds=1,2,3` returns each player's progression,
// stats, Achievements, Challenge progress and Steam achievements in one call.
// Stats are Career by default; ?season=current or ?season=N opts in, and
// everything else stays career-long.
export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const steamIds = parseSteamIdList(searchParams.get("steamIds"));

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
    const scope = await apiSeasonScope(db, searchParams);
    if (scope instanceof Response) return scope;

    const details = await getPlayerDetails(db, CONFIGURED_SERVER_BASE_URL, steamIds, scope);
    return Response.json(
      scope.kind === "career" ? details : { season: seasonSummary(scope.season), ...details },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
