import { db } from "@/lib/db";
import { countKills, getRecentKills, RECENT_KILLS_LIMIT } from "@/lib/recent-kills";
import { resolveApiServer } from "@/lib/server-lookup";

// The kill feed's starting point: the page loads this, then opens
// /api/live-kills/stream from the newest id it received. Oldest first by
// default; `?order=desc` returns the same Kills newest first. `?page=n` steps
// back through older Kills, 20 at a time: page 1 is always the latest 20.
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const server = await resolveApiServer(db, params);
    if (server instanceof Response) return server;
    const requestedPage = Number.parseInt(params.get("page") ?? "1", 10);
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

    const [kills, totalCount] = await Promise.all([
      getRecentKills(db, server.id, { offset: (page - 1) * RECENT_KILLS_LIMIT }),
      countKills(db, server.id),
    ]);

    return Response.json({
      kills: params.get("order") === "desc" ? kills.reverse() : kills,
      page,
      pageSize: RECENT_KILLS_LIMIT,
      totalCount,
      totalPages: Math.ceil(totalCount / RECENT_KILLS_LIMIT),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
