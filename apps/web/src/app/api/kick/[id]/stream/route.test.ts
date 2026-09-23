import { createDb, kickVoteBallots, kickVotes, latestSnapshots, servers, type Database } from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { snapshotFixture } from "@/lib/live-snapshot-fixture";
import { castBallot, startKickVote } from "@/lib/kick-vote";
import { stopKickVoteUpdateListener } from "@/lib/kick-vote-notifications";
import { GET } from "./route";

const db: Database = createDb(process.env.DATABASE_URL!);

const opened: AbortController[] = [];

afterEach(async () => {
  opened.splice(0).forEach((controller) => controller.abort());
  await db.delete(kickVoteBallots);
  await db.delete(kickVotes);
  await db.delete(latestSnapshots);
  await db.delete(servers);
});

afterAll(async () => {
  await stopKickVoteUpdateListener();
  await db.$client.end();
});

async function seedActiveVote() {
  const [server] = await db
    .insert(servers)
    .values({ name: "WDZA Test", baseUrl: `http://rcon-kick-vote-stream-${crypto.randomUUID()}.test:9006` })
    .returning();
  await db.insert(latestSnapshots).values({
    serverId: server.id,
    capturedAt: new Date(),
    payload: snapshotFixture({
      players: [
        { steamId: "1", displayName: "Cheatermc", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, ping: 40 },
        // The Verified Player starting the vote, who must be online too.
        { steamId: "76561198000000100", displayName: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, ping: 40 },
      ],
    }),
  });
  const started = await startKickVote(db, {
    serverId: server.id,
    targetSteamId: "1",
    reason: "wallhacks",
    initiatorSteamId: "76561198000000100",
  });
  if (!started.ok) throw new Error("failed to start KickVote in test setup");
  return started.kickVoteId;
}

function connect(id: string) {
  const controller = new AbortController();
  opened.push(controller);
  const request = new Request(`http://localhost/api/kick/${id}/stream`, { signal: controller.signal });
  return GET(request, { params: Promise.resolve({ id }) });
}

interface SseEvent {
  event?: string;
  data?: string;
}

interface Reading {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  decoder: TextDecoder;
  buffer: string;
}
const readings = new WeakMap<Response, Reading>();

async function nextEvent(response: Response, timeoutMs = 3000): Promise<SseEvent | null> {
  let reading = readings.get(response);
  if (!reading) {
    reading = { reader: response.body!.getReader(), decoder: new TextDecoder(), buffer: "" };
    readings.set(response, reading);
  }
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const end = reading.buffer.indexOf("\n\n");
    if (end !== -1) {
      const frame = reading.buffer.slice(0, end);
      reading.buffer = reading.buffer.slice(end + 2);
      if (frame.startsWith(":")) continue;
      const event: SseEvent = {};
      for (const line of frame.split("\n")) {
        const [field, ...rest] = line.split(":");
        if (field === "event" || field === "data") event[field] = rest.join(":").trimStart();
      }
      return event;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Timed out waiting for the stream");
    const chunk = await Promise.race([
      reading.reader.read(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for the stream")), remaining)),
    ]);
    if (chunk.done) return null;
    reading.buffer += reading.decoder.decode(chunk.value, { stream: true });
  }
}

describe("GET /api/kick/[id]/stream", () => {
  it("returns 404 for an unknown KickVote", async () => {
    const response = await connect("999999");

    expect(response.status).toBe(404);
  });

  it("sends the current Ballot count and status on connect", async () => {
    const kickVoteId = await seedActiveVote();

    const response = await connect(String(kickVoteId));
    const event = await nextEvent(response);

    expect(event?.event).toBe("update");
    expect(JSON.parse(event!.data!)).toEqual({ status: "active", ballotCount: 0, threshold: 25 });
  });

  it("pushes an update the moment a Ballot is cast", async () => {
    const kickVoteId = await seedActiveVote();
    const response = await connect(String(kickVoteId));
    await nextEvent(response); // initial snapshot

    await castBallot(db, { kickVoteId, sessionId: "voter-1" });
    const event = await nextEvent(response);

    expect(JSON.parse(event!.data!)).toMatchObject({ ballotCount: 1 });
  });
});
