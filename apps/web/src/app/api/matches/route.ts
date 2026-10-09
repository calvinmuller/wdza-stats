import { db } from "@/lib/db";
import { resolveApiServer } from "@/lib/server-lookup";
import { getMatchesPage, parseMatchesPage } from "@/lib/match-history";

export async function GET(request: Request) {
  try {
    const server = await resolveApiServer(db, new URL(request.url).searchParams);
    if (server instanceof Response) return server;
    const page = parseMatchesPage(new URL(request.url).searchParams.get("page"));
    const result = await getMatchesPage(db, server.baseUrl, page);

    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
