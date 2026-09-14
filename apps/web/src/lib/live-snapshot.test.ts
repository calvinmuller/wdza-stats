import {
  createDb,
  latestSnapshots,
  servers,
  steamProfiles,
  type Database,
} from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { getLiveSnapshot } from "./live-snapshot";
import { snapshotFixture } from "./live-snapshot-fixture";

const db: Database = createDb(process.env.DATABASE_URL!);

afterEach(async () => {
  await db.delete(latestSnapshots);
  await db.delete(servers);
  await db.delete(steamProfiles);
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

  it("returns the Server's name and latest Snapshot payload, with no avatar for a player with no cached SteamProfile", async () => {
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
      snapshot: {
        ...snapshot,
        players: snapshot.players.map((player) => ({ ...player, avatarUrl: null })),
      },
    });
  });

  it("joins in each online player's cached Steam avatar", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: "http://rcon.test:9006" })
      .returning();
    const capturedAt = new Date("2026-01-01T00:00:00.000Z");
    const snapshot = snapshotFixture({
      players: [
        {
          steamId: "1",
          displayName: "Alice",
          faction: "Lonestar",
          kills: 3,
          deaths: 1,
          cash: 500,
          ping: 40,
        },
      ],
    });
    await db
      .insert(latestSnapshots)
      .values({ serverId: server.id, capturedAt, payload: snapshot });
    await db.insert(steamProfiles).values({
      steamId: "1",
      personaName: "Alice",
      avatarUrl: "https://avatars.steamstatic.com/alice.jpg",
      achievements: [],
      playtimeMinutes: null,
      status: "ok",
      fetchedAt: new Date(),
    });

    const result = await getLiveSnapshot(db, "http://rcon.test:9006");

    expect(result?.snapshot.players).toEqual([
      { ...snapshot.players[0], avatarUrl: "https://avatars.steamstatic.com/alice.jpg" },
    ]);
  });
});
