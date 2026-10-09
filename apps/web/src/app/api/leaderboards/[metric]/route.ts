import { db } from "@/lib/db";
import { resolveApiServer } from "@/lib/server-lookup";
import { getRankings, isRankingMetric, parseRankingsPage } from "@/lib/rankings";
import { apiSeasonScope } from "@/lib/season-scope";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ metric: string }> },
) {
  const { metric } = await params;

  if (!isRankingMetric(metric)) {
    return Response.json(
      { error: `Unknown leaderboard metric: ${metric}` },
      { status: 400 },
    );
  }

  try {
    const server = await resolveApiServer(db, new URL(request.url).searchParams);
    if (server instanceof Response) return server;
    const searchParams = new URL(request.url).searchParams;
    const scope = await apiSeasonScope(db, searchParams);
    if (scope instanceof Response) return scope;

    const page = parseRankingsPage(searchParams.get("page"));
    const result = await getRankings(db, server.baseUrl, metric, page, scope);

    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
