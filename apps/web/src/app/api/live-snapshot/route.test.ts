import { createDb, latestSnapshots, servers, type Database } from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { snapshotFixture } from "@/lib/live-snapshot-fixture";
import { GET } from "./route";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = process.env.RCON_BASE_URL!;
const SLUG = "wdza-test";

afterEach(async () => {
  await db.delete(latestSnapshots);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

const get = (query = "") => GET(new Request(`http://localhost/api/live-snapshot${query}`));

async function seedServerWithSnapshot(values: { name: string; slug: string; baseUrl: string }, map: string) {
  const [server] = await db.insert(servers).values(values).returning();
  const capturedAt = new Date("2026-01-01T00:00:00.000Z");
  await db.insert(latestSnapshots).values({
    serverId: server.id,
    capturedAt,
    payload: snapshotFixture({ map, players: [] }),
  });
  return { server, capturedAt };
}

describe("GET /api/live-snapshot", () => {
  it("returns 404 when no Server is tracked", async () => {
    const response = await get();

    expect(response.status).toBe(404);
  });

  it("returns 404 when the Server has no live Snapshot yet", async () => {
    await db.insert(servers).values({ name: "WDZA Test", slug: SLUG, baseUrl: BASE_URL });

    const response = await get();

    expect(response.status).toBe(404);
  });

  it("returns the default Server's latest Snapshot as JSON", async () => {
    const { server, capturedAt } = await seedServerWithSnapshot(
      { name: "WDZA Test", slug: SLUG, baseUrl: BASE_URL },
      "Deadcity",
    );

    const response = await get();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      serverId: server.id,
      serverName: "WDZA Test",
      serverSlug: SLUG,
      capturedAt: capturedAt.toISOString(),
      snapshot: expect.objectContaining({ map: "Deadcity" }),
      activeChallenges: [],
      recentNotifications: [],
      cashHistory: [],
      activeKickVote: null,
      staffSteamIds: [],
    });
  });

  it("returns the Server named by ?server=", async () => {
    await seedServerWithSnapshot({ name: "WDZA Test", slug: SLUG, baseUrl: BASE_URL }, "Deadcity");
    await seedServerWithSnapshot({ name: "Second", slug: "second", baseUrl: "http://second.test:9006" }, "Foundry");

    const body = await (await get("?server=second")).json();

    expect(body).toMatchObject({ serverName: "Second", snapshot: expect.objectContaining({ map: "Foundry" }) });
  });

  it("returns 404 for a slug no enabled Server has", async () => {
    await seedServerWithSnapshot(
      { name: "Retired", slug: "retired", baseUrl: "http://retired.test:9006" },
      "Foundry",
    );
    await db.update(servers).set({ enabled: false });

    expect((await get("?server=retired")).status).toBe(404);
    expect((await get("?server=nope")).status).toBe(404);
  });
});
