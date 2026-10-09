import { db } from "@/lib/db";
import { resolveApiServer } from "@/lib/server-lookup";
import { getPlayerChallengeProgress } from "@/lib/player-progression";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ steamId: string }> },
) {
  const { steamId } = await params;

  try {
    const server = await resolveApiServer(db, new URL(request.url).searchParams);
    if (server instanceof Response) return server;
    const challenges = await getPlayerChallengeProgress(db, server.baseUrl, steamId);

    return Response.json(challenges);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
