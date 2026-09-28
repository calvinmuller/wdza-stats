import { db } from "@/lib/db";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { getLiveSnapshot } from "@/lib/live-snapshot";
import { getServerByBaseUrl } from "@/lib/server-lookup";
import { subscribeToSnapshots } from "@/lib/snapshot-notifications";

// The homepage's live dashboard as Server-Sent Events: the same view
// /api/live-snapshot returns, resent in full each time the Worker stores a
// new Snapshot. Like /api/kick/{id}/stream there is nothing to replay - a
// reconnect just gets the current view on connect.
const encoder = new TextEncoder();

// Idle proxies drop quiet connections; a comment now and then keeps this one open.
const KEEPALIVE_MS = 15_000;

function frame(data: unknown): Uint8Array {
  return encoder.encode(`event: update\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function GET(request: Request) {
  const server = await getServerByBaseUrl(db, CONFIGURED_SERVER_BASE_URL);
  if (!server) {
    return Response.json({ error: "No live Server configured." }, { status: 404 });
  }

  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let unsubscribe = () => {};

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
      const keepalive = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, KEEPALIVE_MS);
      request.signal.addEventListener("abort", close, { once: true });

      // Chained so a slow read can't land after a newer one and roll the page back.
      let pending = Promise.resolve();
      const push = () => {
        pending = pending.then(async () => {
          try {
            const next = await getLiveSnapshot(db, CONFIGURED_SERVER_BASE_URL);
            if (!closed && next) controller.enqueue(frame(next));
          } catch (error) {
            // Keep the stream open; the next Snapshot gets another try.
            console.error("[web] live snapshot stream read failed:", error);
          }
        });
      };

      // Subscribe before the first read, so a Snapshot stored in between still wakes us.
      unsubscribe = await subscribeToSnapshots(server.id, push);
      if (closed) {
        unsubscribe();
        return;
      }
      push();
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
