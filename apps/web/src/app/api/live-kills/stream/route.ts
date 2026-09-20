import { db } from "@/lib/db";
import { subscribeToKills } from "@/lib/kill-notifications";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { getRecentKills, type KillView } from "@/lib/recent-kills";
import { getServerByBaseUrl } from "@/lib/server-lookup";

// The kill feed as Server-Sent Events. A first connection names where it
// starts with ?after=<id> (EventSource cannot send headers); a reconnect sends
// Last-Event-ID itself, and that wins because it is newer than the URL. With
// neither, the stream starts from now.
const encoder = new TextEncoder();

// A reconnecting client is caught up from the database, but only this far: a
// client further behind is told to reload the feed instead of being flooded.
const MAX_REPLAY = 50;

// Idle proxies drop quiet connections; a comment now and then keeps this one open.
const KEEPALIVE_MS = 15_000;

const killFrame = (kill: KillView) =>
  encoder.encode(
    `id: ${kill.id}\nevent: kill\ndata: ${JSON.stringify(kill)}\n\n`,
  );

function parseCursor(...candidates: (string | null)[]): number | null {
  for (const candidate of candidates) {
    if (candidate !== null && /^\d+$/.test(candidate)) return Number(candidate);
  }
  return null;
}

export async function GET(request: Request) {
  const server = await getServerByBaseUrl(db, CONFIGURED_SERVER_BASE_URL);
  if (!server) {
    return Response.json({ error: "Unknown Server." }, { status: 404 });
  }
  const serverId = server.id;
  const cursor = parseCursor(
    request.headers.get("last-event-id"),
    new URL(request.url).searchParams.get("after"),
  );

  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let lastId = 0;

      const close = () => {
        if (closed) return;
        closed = true;
        cleanup();
        controller.close();
      };
      cleanup = () => {
        closed = true;
        clearInterval(keepalive);
        unsubscribe();
      };
      let unsubscribe = () => {};
      const keepalive = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, KEEPALIVE_MS);
      request.signal.addEventListener("abort", close, { once: true });

      if (cursor !== null) {
        lastId = cursor;
        // One more than the cap: seeing it is how we know the client is too far behind.
        const missed = await getRecentKills(db, serverId, {
          afterId: cursor,
          limit: MAX_REPLAY + 1,
        });
        if (missed.length > MAX_REPLAY) {
          controller.enqueue(encoder.encode("event: reset\ndata: {}\n\n"));
          close();
          return;
        }
        for (const kill of missed) {
          controller.enqueue(killFrame(kill));
          lastId = kill.id;
        }
      } else {
        const [newest] = await getRecentKills(db, serverId, { limit: 1 });
        lastId = newest?.id ?? 0;
      }

      // Send whatever is stored past lastId. Wake-ups that arrive mid-read
      // fold into one more pass, so Kills go out in order and exactly once.
      let draining = false;
      let again = false;
      const drain = async () => {
        if (draining) {
          again = true;
          return;
        }
        draining = true;
        try {
          do {
            again = false;
            const fresh = await getRecentKills(db, serverId, {
              afterId: lastId,
              limit: 100,
            });
            for (const kill of fresh) {
              if (closed) return;
              controller.enqueue(killFrame(kill));
              lastId = kill.id;
            }
            if (fresh.length === 100) again = true;
          } while (again && !closed);
        } catch (error) {
          console.warn(
            `[web] kill stream read failed for server ${serverId}:`,
            error,
          );
        } finally {
          draining = false;
        }
      };

      unsubscribe = await subscribeToKills(serverId, () => void drain());
      if (closed) {
        unsubscribe();
        return;
      }
      // Anything stored between the replay read and the LISTEN going live.
      await drain();
      if (!closed) controller.enqueue(encoder.encode(": connected\n\n"));
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
