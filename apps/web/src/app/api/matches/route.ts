import { db } from "@/lib/db";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { getMatchesPage, parseMatchesPage } from "@/lib/match-history";

export async function GET(request: Request) {
  try {
    const page = parseMatchesPage(new URL(request.url).searchParams.get("page"));
    const result = await getMatchesPage(db, CONFIGURED_SERVER_BASE_URL, page);

    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
