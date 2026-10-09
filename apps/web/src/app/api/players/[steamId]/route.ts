import { db } from "@/lib/db";
import { resolveApiServer } from "@/lib/server-lookup";
import { getPlayerProgression } from "@/lib/player-progression";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ steamId: string }> },
) {
  const { steamId } = await params;

  try {
    const server = await resolveApiServer(db, new URL(request.url).searchParams);
    if (server instanceof Response) return server;
    const progression = await getPlayerProgression(db, server.baseUrl, steamId);

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
