import { db } from "@/lib/db";
import { resolveApiServer } from "@/lib/server-lookup";
import { getLiveSnapshot } from "@/lib/live-snapshot";

export async function GET(request: Request) {
  try {
    const server = await resolveApiServer(db, new URL(request.url).searchParams);
    if (server instanceof Response) return server;
    const data = await getLiveSnapshot(db, server.baseUrl);

    if (!data) {
      return Response.json(
        { error: "No live Snapshot available yet." },
        { status: 404 },
      );
    }

    return Response.json(data);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
