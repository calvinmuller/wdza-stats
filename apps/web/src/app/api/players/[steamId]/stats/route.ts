import { db } from "@/lib/db";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { getPlayerStats } from "@/lib/player-progression";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ steamId: string }> },
) {
  const { steamId } = await params;

  try {
    const stats = await getPlayerStats(db, CONFIGURED_SERVER_BASE_URL, steamId);

    if (!stats) {
      return Response.json(
        { error: `No player found with steamId ${steamId}` },
        { status: 404 },
      );
    }

    return Response.json(stats);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
