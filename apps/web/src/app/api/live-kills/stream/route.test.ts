import { createHash } from "node:crypto";
import { createDb, kills, servers, type Database } from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { POST as ingest } from "@/app/api/ingest/events/route";
import { stopKillListener } from "@/lib/kill-notifications";
import { getRecentKills } from "@/lib/recent-kills";
import { GET } from "./route";

const db: Database = createDb(process.env.DATABASE_URL!);
const BASE_URL = process.env.RCON_BASE_URL!;

const opened: AbortController[] = [];

afterEach(async () => {
  // Closing a stream is the client going away; every test does it on exit.
  opened.splice(0).forEach((controller) => controller.abort());
  await db.delete(kills);
  await db.delete(servers);
});

afterAll(async () => {
  await stopKillListener();
  await db.$client.end();
});

const FEED_TOKEN = "wkf_" + "a".repeat(43);

async function seedServer() {
  const [server] = await db
    .insert(servers)
    .values({
      name: "WDZA Test",
      baseUrl: BASE_URL,
      feedTokenHash: createHash("sha256").update(FEED_TOKEN).digest("hex"),
    })
    .returning();
  return server;
}

// What the game does: post a batch of one kill with the Server's token.
function ingestKill(eventId: string, victimName = "Bob", token = FEED_TOKEN) {
  return ingest(
    new Request("http://localhost/api/ingest/events", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({
        serverId: "boot",
        serverName: "x",
        events: [
          {
            eventId,
            type: "killed",
            eventTime: 5,
            matchId: "m",
            mapName: "Kavkazi",
            victimName,
            victimSteamId: "76561198000000002",
          },
        ],
      }),
    }),
  );
}

async function seedKills(serverId: number, count: number, start = 1) {
  for (let n = start; n < start + count; n++) {
    await db.insert(kills).values({
      serverId,
      eventId: `event-${n}`,
      instanceId: "boot",
      gameMatchId: "game-match",
      eventTime: n,
      map: "Kavkazi",
      victimSteamId: "76561198000000002",
      victimName: `Victim ${n}`,
      tags: [],
    });
  }
}

function connect(path = "", headers: Record<string, string> = {}) {
  const controller = new AbortController();
  opened.push(controller);
  const request = new Request(`http://localhost/api/live-kills/stream${path}`, {
    headers,
    signal: controller.signal,
  });
  return { response: GET(request), controller };
}

interface SseEvent {
  id?: string;
  event?: string;
  data?: string;
}

// One open stream's reader, kept so successive reads continue where the last
// stopped rather than losing whatever was already buffered.
interface Reading {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  decoder: TextDecoder;
  buffer: string;
  frames: { comment?: string; event?: SseEvent }[];
}
const readings = new WeakMap<Response, Reading>();

async function nextFrame(response: Response, deadline: number) {
  let reading = readings.get(response);
  if (!reading) {
    reading = {
      reader: response.body!.getReader(),
      decoder: new TextDecoder(),
      buffer: "",
      frames: [],
    };
    readings.set(response, reading);
  }
  while (reading.frames.length === 0) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Timed out waiting for the stream");
    const chunk = await Promise.race([
      reading.reader.read(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Timed out waiting for the stream")),
          remaining,
        ),
      ),
    ]);
    if (chunk.done) return null;
    reading.buffer += reading.decoder.decode(chunk.value, { stream: true });
    let end: number;
    while ((end = reading.buffer.indexOf("\n\n")) !== -1) {
      const frame = reading.buffer.slice(0, end);
      reading.buffer = reading.buffer.slice(end + 2);
      if (frame.startsWith(":")) {
        reading.frames.push({ comment: frame.slice(1).trim() });
        continue;
      }
      const event: SseEvent = {};
      for (const line of frame.split("\n")) {
        const [field, ...rest] = line.split(":");
        const value = rest.join(":").trimStart();
        if (field === "id" || field === "event" || field === "data")
          event[field] = value;
      }
      reading.frames.push({ event });
    }
  }
  return reading.frames.shift()!;
}

// Reads until `count` events (not comments) have arrived.
async function readEvents(response: Response, count: number, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  const events: SseEvent[] = [];
  while (events.length < count) {
    const frame = await nextFrame(response, deadline);
    if (!frame) break;
    if (frame.event) events.push(frame.event);
  }
  return events;
}

// The server says so once it is subscribed; only then is a Kill guaranteed to reach it.
async function waitUntilConnected(response: Response, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  // Events sent before the announcement (a replay) are kept for the next read.
  const early: { comment?: string; event?: SseEvent }[] = [];
  for (;;) {
    const frame = await nextFrame(response, deadline);
    if (!frame) throw new Error("Stream closed before it connected");
    if (frame.comment === "connected") break;
    if (frame.event) early.push(frame);
  }
  readings.get(response)!.frames.unshift(...early);
}

describe("GET /api/live-kills/stream", () => {
  it("returns 404 when the configured Server is not known", async () => {
    const { response } = connect();

    expect((await response).status).toBe(404);
  });

  it("answers as an event stream", async () => {
    await seedServer();

    const response = await connect().response;

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("no-cache");
  });

  it("replays the Kills after the Last-Event-ID, each with its id", async () => {
    const server = await seedServer();
    await seedKills(server.id, 4);
    const [, second] = await getRecentKills(db, server.id);

    const response = await connect("", { "last-event-id": String(second.id) })
      .response;
    const events = await readEvents(response, 2);

    expect(events.map((e) => e.event)).toEqual(["kill", "kill"]);
    expect(events.map((e) => JSON.parse(e.data!).victimName)).toEqual([
      "Victim 3",
      "Victim 4",
    ]);
    expect(events.map((e) => Number(e.id))).toEqual([
      second.id + 1,
      second.id + 2,
    ]);
  });

  it("starts from ?after= on a first connection, which cannot send Last-Event-ID", async () => {
    const server = await seedServer();
    await seedKills(server.id, 3);
    const [first] = await getRecentKills(db, server.id);

    const response = await connect(`?after=${first.id}`).response;
    const events = await readEvents(response, 2);

    expect(events.map((e) => JSON.parse(e.data!).victimName)).toEqual([
      "Victim 2",
      "Victim 3",
    ]);
  });

  it("prefers Last-Event-ID over ?after= when a connection is resumed", async () => {
    const server = await seedServer();
    await seedKills(server.id, 4);
    const [first, , third] = await getRecentKills(db, server.id);

    const response = await connect(`?after=${first.id}`, {
      "last-event-id": String(third.id),
    }).response;
    const events = await readEvents(response, 1);

    expect(events.map((e) => JSON.parse(e.data!).victimName)).toEqual([
      "Victim 4",
    ]);
  });

  it("replays up to 50 Kills a reconnecting client missed", async () => {
    const server = await seedServer();
    await seedKills(server.id, 51);
    const [first] = await getRecentKills(db, server.id, { limit: 51 });

    const response = await connect("", { "last-event-id": String(first.id) })
      .response;
    const events = await readEvents(response, 50);

    expect(events).toHaveLength(50);
    expect(events.every((e) => e.event === "kill")).toBe(true);
    expect(JSON.parse(events[49].data!).victimName).toBe("Victim 51");
  });

  it("tells a client that missed more than 50 Kills to start over, and replays none", async () => {
    const server = await seedServer();
    await seedKills(server.id, 52);
    const [first] = await getRecentKills(db, server.id, { limit: 52 });

    const response = await connect("", { "last-event-id": String(first.id) })
      .response;
    const events = await readEvents(response, 1);

    expect(events).toEqual([{ event: "reset", data: "{}" }]);
  });

  it("delivers a Kill the moment the game reports it", async () => {
    await seedServer();
    const response = await connect().response;
    await waitUntilConnected(response);

    await ingestKill("live-1", "Live Victim");
    const [event] = await readEvents(response, 1);

    expect(event.event).toBe("kill");
    expect(JSON.parse(event.data!).victimName).toBe("Live Victim");
    expect(Number(event.id)).toBe(JSON.parse(event.data!).id);
  });

  it("does not deliver a Kill reported for a different Server", async () => {
    await seedServer();
    const otherToken = "wkf_" + "b".repeat(43);
    await db.insert(servers).values({
      name: "Other",
      baseUrl: "http://other.test",
      feedTokenHash: createHash("sha256").update(otherToken).digest("hex"),
    });
    const response = await connect().response;
    await waitUntilConnected(response);

    await ingestKill("theirs-1", "Their Victim", otherToken);
    await ingestKill("ours-1", "Our Victim");
    const events = await readEvents(response, 1);

    expect(events.map((e) => JSON.parse(e.data!).victimName)).toEqual([
      "Our Victim",
    ]);
  });

  it("delivers a resent Kill only once", async () => {
    await seedServer();
    const response = await connect().response;
    await waitUntilConnected(response);

    await ingestKill("dup-1", "First");
    await ingestKill("dup-1", "First");
    await ingestKill("dup-2", "Second");
    const events = await readEvents(response, 2);

    expect(events.map((e) => JSON.parse(e.data!).victimName)).toEqual([
      "First",
      "Second",
    ]);
  });

  it("delivers Kills in the order they were reported", async () => {
    await seedServer();
    const response = await connect().response;
    await waitUntilConnected(response);

    for (const n of [1, 2, 3, 4, 5])
      await ingestKill(`order-${n}`, `Victim ${n}`);
    const events = await readEvents(response, 5);

    expect(events.map((e) => JSON.parse(e.data!).victimName)).toEqual([
      "Victim 1",
      "Victim 2",
      "Victim 3",
      "Victim 4",
      "Victim 5",
    ]);
    const ids = events.map((e) => Number(e.id));
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it("catches up on Kills stored while a reconnecting client was away, then goes live", async () => {
    const server = await seedServer();
    await ingestKill("gap-1", "Before");
    const [before] = await getRecentKills(db, server.id);
    await ingestKill("gap-2", "While away");

    const response = await connect("", { "last-event-id": String(before.id) })
      .response;
    await waitUntilConnected(response);
    await ingestKill("gap-3", "After");
    const events = await readEvents(response, 2);

    expect(events.map((e) => JSON.parse(e.data!).victimName)).toEqual([
      "While away",
      "After",
    ]);
  });

  it("ends the stream when the client goes away", async () => {
    await seedServer();
    const { response, controller } = connect();
    const opened = await response;
    await waitUntilConnected(opened);

    controller.abort();

    await expect(nextFrame(opened, Date.now() + 2000)).resolves.toBeNull();
  });
});
