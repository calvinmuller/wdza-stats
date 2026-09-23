import { db } from "@/lib/db";
import { getBallotCount, getKickVote } from "@/lib/kick-vote";
import { subscribeToKickVoteUpdates } from "@/lib/kick-vote-notifications";

// The /kick/{id} page's live Ballot count and status, as Server-Sent Events -
// see ticket 02. Unlike the kill feed's ordered event log, there is nothing
// to replay: the whole state is one small snapshot, so every update just
// resends it in full rather than diffing.
const encoder = new TextEncoder();

// Idle proxies drop quiet connections; a comment now and then keeps this one open.
const KEEPALIVE_MS = 15_000;

function frame(data: unknown): Uint8Array {
  return encoder.encode(`event: update\ndata: ${JSON.stringify(data)}\n\n`);
}

async function snapshot(kickVoteId: number) {
  const vote = await getKickVote(db, kickVoteId);
  if (!vote) return null;
  const ballotCount = await getBallotCount(db, kickVoteId);
  return { status: vote.status, ballotCount, threshold: vote.threshold };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kickVoteId = Number(id);
  if (!Number.isInteger(kickVoteId)) {
    return Response.json({ error: "Unknown KickVote." }, { status: 404 });
  }

  const initial = await snapshot(kickVoteId);
  if (!initial) {
    return Response.json({ error: "Unknown KickVote." }, { status: 404 });
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

      controller.enqueue(frame(initial));

      const push = async () => {
        const next = await snapshot(kickVoteId);
        if (!closed && next) controller.enqueue(frame(next));
      };

      unsubscribe = await subscribeToKickVoteUpdates(kickVoteId, () => void push());
      if (closed) unsubscribe();
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
