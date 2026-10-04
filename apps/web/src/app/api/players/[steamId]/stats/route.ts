import { db } from "@/lib/db";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { getPlayerStatsInScope } from "@/lib/player-progression";
import { apiSeasonScope, seasonSummary } from "@/lib/season-scope";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ steamId: string }> },
) {
  const { steamId } = await params;

  try {
    const scope = await apiSeasonScope(db, new URL(request.url).searchParams);
    if (scope instanceof Response) return scope;

    const result = await getPlayerStatsInScope(db, CONFIGURED_SERVER_BASE_URL, steamId, scope);

    if (!result) {
      return Response.json(
        { error: `No player found with steamId ${steamId}` },
        { status: 404 },
      );
    }

    // Career keeps its original flat shape. A Season response names the
    // Season and nests the stats, which are null when the player played no
    // Match in it - the player exists, they just have nothing to show.
    return Response.json(
      scope.kind === "career"
        ? result.stats
        : { steamId, season: seasonSummary(scope.season), stats: result.stats },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
