import { db } from "@/lib/db";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { getLiveSnapshot } from "@/lib/live-snapshot";

export async function GET() {
  try {
    const data = await getLiveSnapshot(db, CONFIGURED_SERVER_BASE_URL);

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
