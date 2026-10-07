import { listBannedPlayers } from "@/lib/admin-config";
import { db } from "@/lib/db";

// Public list of BannedPlayers - see schema.ts's bannedPlayers doc comment.
// One list for both sources: bans made in the admin area ("site") and the
// game server's own bans, which the Worker copies in ("server").
// Fields are picked explicitly so a column later added for staff eyes only
// (e.g. who issued the ban) never leaks here by default.
export async function GET() {
  try {
    const rows = await listBannedPlayers(db);
    const bans = rows.map(({ steamId, reason, bannedAt, source }) => ({ steamId, reason, bannedAt, source }));

    return Response.json({ bans });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
