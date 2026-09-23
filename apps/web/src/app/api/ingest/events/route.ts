import { kills, latestSnapshots, matches, servers } from "@wdza-stats/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifyKills } from "@/lib/kill-notifications";
import {
  BatchTooLargeError,
  MAX_BODY_BYTES,
  hashFeedToken,
  parseBatch,
  parseFeedBearer,
} from "@/lib/kill-feed";
import { relayToWarcon } from "@/lib/warcon-relay";

// Where the game posts its kill feed: [WDServerFeed] Url is the web origin and
// the game appends /api/ingest/events itself. The bearer token is the only
// credential - no session, no CSRF - and identifies the Server.
export async function POST(request: Request) {
  const token = parseFeedBearer(request.headers.get("authorization"));
  const [server] = token
    ? await db
        .select({ id: servers.id })
        .from(servers)
        .where(eq(servers.feedTokenHash, hashFeedToken(token)))
    : [];
  if (!server) {
    return Response.json(
      { error: "Unknown kill feed token." },
      { status: 401 },
    );
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return Response.json({ error: "Batch too large." }, { status: 413 });
  }
  // Raw and unparsed, so Warcon sees exactly what the game sent. Not awaited.
  void relayToWarcon(text);
  let batch: ReturnType<typeof parseBatch>;
  try {
    batch = parseBatch(JSON.parse(text));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Malformed JSON body.";
    return Response.json(
      { error: message },
      { status: error instanceof BatchTooLargeError ? 413 : 400 },
    );
  }
  let accepted = 0;
  if (batch.kills.length) {
    // Where the Server was when these arrived: the game's own match id is per
    // boot, so the Match is the one we have open, and the game sends no
    // Factions, so they come from the latest Snapshot.
    const [openMatch] = await db
      .select({ id: matches.id })
      .from(matches)
      .where(and(eq(matches.serverId, server.id), isNull(matches.endedAt)))
      .orderBy(desc(matches.startedAt))
      .limit(1);
    const [snapshot] = await db
      .select({ payload: latestSnapshots.payload })
      .from(latestSnapshots)
      .where(eq(latestSnapshots.serverId, server.id));
    const factionOf = new Map(
      (snapshot?.payload.players ?? []).map((player) => [
        player.steamId,
        player.faction,
      ]),
    );

    const inserted = await db
      .insert(kills)
      .values(
        batch.kills.map((kill) => ({
          serverId: server.id,
          instanceId: batch.instanceId,
          gameMatchId: kill.matchId,
          matchRow: openMatch?.id ?? null,
          eventId: kill.eventId,
          eventTime: kill.eventTime,
          map: kill.map,
          killerSteamId: kill.killerSteamId,
          killerName: kill.killerName,
          killerFaction: kill.killerSteamId
            ? (factionOf.get(kill.killerSteamId) ?? null)
            : null,
          victimSteamId: kill.victimSteamId,
          victimName: kill.victimName,
          victimFaction: factionOf.get(kill.victimSteamId) ?? null,
          cause: kill.cause,
          distanceM: kill.distanceM,
          headshot: kill.headshot,
          suicide: kill.suicide,
          tags: kill.tags,
        })),
      )
      // The game may resend a batch it never saw acknowledged; a Kill is stored once.
      .onConflictDoNothing({ target: [kills.serverId, kills.eventId] })
      .returning({ id: kills.id });
    accepted = inserted.length;
    // Live streams read the new rows themselves; a failed nudge must not fail
    // an ingest whose Kills are already stored.
    if (accepted > 0) {
      await notifyKills(db, server.id).catch((error) =>
        console.warn(
          `[web] kill notify failed for server ${server.id}:`,
          error,
        ),
      );
    }
  }
  return Response.json({
    ok: true,
    accepted,
    skipped: batch.skipped,
    duplicates: batch.kills.length - accepted,
  });
}
