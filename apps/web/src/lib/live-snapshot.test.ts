import { createDb, latestSnapshots, servers, type Database } from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { getLiveSnapshot } from "./live-snapshot";
import { snapshotFixture } from "./live-snapshot-fixture";

const db: Database = createDb(process.env.DATABASE_URL!);

afterEach(async () => {
  await db.delete(latestSnapshots);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

describe("getLiveSnapshot", () => {
  it("returns null when no Server is seeded for the given baseUrl", async () => {
    const result = await getLiveSnapshot(db, "http://unknown.test:9006");

    expect(result).toBeNull();
  });

  it("returns null when the Server has no Snapshot yet", async () => {
    await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: "http://rcon.test:9006" });

    const result = await getLiveSnapshot(db, "http://rcon.test:9006");

    expect(result).toBeNull();
  });

  it("returns the Server's name and latest Snapshot payload", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: "http://rcon.test:9006" })
      .returning();
    const capturedAt = new Date("2026-01-01T00:00:00.000Z");
    const snapshot = snapshotFixture({ map: "Deadcity" });
    await db
      .insert(latestSnapshots)
      .values({ serverId: server.id, capturedAt, payload: snapshot });

    const result = await getLiveSnapshot(db, "http://rcon.test:9006");

    expect(result).toEqual({
      serverName: "WDZA Test",
      capturedAt: capturedAt.toISOString(),
      snapshot,
    });
  });
});
