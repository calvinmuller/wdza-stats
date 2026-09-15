import { db } from "@/lib/db";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { getMatchDetail } from "@/lib/match-history";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const matchId = Number(id);

  if (!Number.isInteger(matchId)) {
    return Response.json({ error: `Invalid match id: ${id}` }, { status: 400 });
  }

  try {
    const match = await getMatchDetail(db, CONFIGURED_SERVER_BASE_URL, matchId);

    if (!match) {
      return Response.json(
        { error: `No match found with id ${matchId}` },
        { status: 404 },
      );
    }

    return Response.json(match);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
