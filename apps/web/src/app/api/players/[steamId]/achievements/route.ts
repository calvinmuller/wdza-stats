import { db } from "@/lib/db";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { getPlayerAchievements } from "@/lib/player-progression";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ steamId: string }> },
) {
  const { steamId } = await params;

  try {
    const achievements = await getPlayerAchievements(db, CONFIGURED_SERVER_BASE_URL, steamId);

    return Response.json(achievements);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
