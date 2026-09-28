import { createDb, latestSnapshots, notifySnapshotCaptured, servers, type Database } from "@wdza-stats/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { snapshotFixture } from "@/lib/live-snapshot-fixture";
import { stopSnapshotListener } from "@/lib/snapshot-notifications";
import { GET } from "./route";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = process.env.RCON_BASE_URL!;

const opened: AbortController[] = [];

afterEach(async () => {
  opened.splice(0).forEach((controller) => controller.abort());
  await db.delete(latestSnapshots);
  await db.delete(servers);
});

afterAll(async () => {
  await stopSnapshotListener();
  await db.$client.end();
});

async function seedServer() {
  const [server] = await db.insert(servers).values({ name: "WDZA Test", baseUrl: BASE_URL }).returning();
  return server;
}

function connect() {
  const controller = new AbortController();
  opened.push(controller);
  return GET(new Request("http://localhost/api/live-snapshot/stream", { signal: controller.signal }));
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

describe("GET /api/live-snapshot/stream", () => {
  it("returns 404 when the configured Server isn't seeded", async () => {
    const response = await connect();

    expect(response.status).toBe(404);
  });

  it("sends the current live view on connect", async () => {
    const server = await seedServer();
    await db.insert(latestSnapshots).values({
      serverId: server.id,
      capturedAt: new Date("2026-01-01T00:00:00.000Z"),
      payload: snapshotFixture({ map: "Deadcity", players: [] }),
    });

    const response = await connect();
    const event = await nextEvent(response);

    expect(event?.event).toBe("update");
    expect(JSON.parse(event!.data!)).toMatchObject({
      serverId: server.id,
      capturedAt: "2026-01-01T00:00:00.000Z",
      snapshot: expect.objectContaining({ map: "Deadcity" }),
    });
  });

  it("pushes the new view the moment the Worker announces a Snapshot", async () => {
    const server = await seedServer();
    await db.insert(latestSnapshots).values({
      serverId: server.id,
      capturedAt: new Date("2026-01-01T00:00:00.000Z"),
      payload: snapshotFixture({ map: "Deadcity", players: [] }),
    });
    const response = await connect();
    await nextEvent(response); // initial view

    await db
      .update(latestSnapshots)
      .set({ capturedAt: new Date("2026-01-01T00:00:15.000Z"), payload: snapshotFixture({ map: "Hollow", players: [] }) })
      .where(eq(latestSnapshots.serverId, server.id));
    await notifySnapshotCaptured(db, server.id);
    const event = await nextEvent(response);

    expect(JSON.parse(event!.data!)).toMatchObject({
      capturedAt: "2026-01-01T00:00:15.000Z",
      snapshot: expect.objectContaining({ map: "Hollow" }),
    });
  });

  it("waits for the Worker's first Snapshot instead of sending an empty view", async () => {
    const server = await seedServer();
    const response = await connect();

    await db.insert(latestSnapshots).values({
      serverId: server.id,
      capturedAt: new Date("2026-01-01T00:00:00.000Z"),
      payload: snapshotFixture({ map: "Deadcity", players: [] }),
    });
    await notifySnapshotCaptured(db, server.id);
    const event = await nextEvent(response);

    expect(JSON.parse(event!.data!)).toMatchObject({ snapshot: expect.objectContaining({ map: "Deadcity" }) });
  });
});
