import { createDb, latestSnapshots, servers, type Database } from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { snapshotFixture } from "@/lib/live-snapshot-fixture";
import { GET } from "./route";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = process.env.RCON_BASE_URL!;

afterEach(async () => {
  await db.delete(latestSnapshots);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

describe("GET /api/live-snapshot", () => {
  it("returns 404 when no live Snapshot is available for the configured Server", async () => {
    const response = await GET();

    expect(response.status).toBe(404);
  });

  it("returns the configured Server's latest Snapshot as JSON", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();
    const capturedAt = new Date("2026-01-01T00:00:00.000Z");
    await db.insert(latestSnapshots).values({
      serverId: server.id,
      capturedAt,
      payload: snapshotFixture({ map: "Deadcity", players: [] }),
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      serverName: "WDZA Test",
      capturedAt: capturedAt.toISOString(),
      snapshot: expect.objectContaining({ map: "Deadcity" }),
      activeChallenges: [],
      recentNotifications: [],
      cashHistory: [],
    });
  });
});
