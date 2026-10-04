import { db } from "@/lib/db";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
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
    const searchParams = new URL(request.url).searchParams;
    const scope = await apiSeasonScope(db, searchParams);
    if (scope instanceof Response) return scope;

    const page = parseRankingsPage(searchParams.get("page"));
    const result = await getRankings(db, CONFIGURED_SERVER_BASE_URL, metric, page, scope);

    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
