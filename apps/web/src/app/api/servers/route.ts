import { db } from "@/lib/db";
import { listPublicServers } from "@/lib/server-lookup";

// The enabled Servers, default first: each one's name and the slug the other
// /api/* routes take as ?server=.
export async function GET() {
  try {
    const servers = await listPublicServers(db);
    return Response.json({ servers: servers.map(({ name, slug }) => ({ name, slug })) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
