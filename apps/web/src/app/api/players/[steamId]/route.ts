import { db } from "@/lib/db";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { getPlayerProgression } from "@/lib/player-progression";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ steamId: string }> },
) {
  const { steamId } = await params;

  try {
    const progression = await getPlayerProgression(db, CONFIGURED_SERVER_BASE_URL, steamId);

    if (!progression) {
      return Response.json(
        { error: `No player found with steamId ${steamId}` },
        { status: 404 },
      );
    }

    return Response.json(progression);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
