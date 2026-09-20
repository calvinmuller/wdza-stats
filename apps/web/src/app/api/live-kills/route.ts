import { db } from "@/lib/db";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { getRecentKills } from "@/lib/recent-kills";
import { getServerByBaseUrl } from "@/lib/server-lookup";

// The kill feed's starting point: the page loads this, then opens
// /api/live-kills/stream from the newest id it received.
export async function GET() {
  try {
    const server = await getServerByBaseUrl(db, CONFIGURED_SERVER_BASE_URL);
    if (!server) {
      return Response.json({ error: "Unknown Server." }, { status: 404 });
    }
    return Response.json({ kills: await getRecentKills(db, server.id) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
