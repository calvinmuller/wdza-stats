import {
  createDb,
  gameEvents,
  matches,
  notifications,
  servers,
  type Database,
} from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { getRecentNotifications } from "./recent-notifications";

const db: Database = createDb(process.env.DATABASE_URL!);

afterEach(async () => {
  await db.delete(notifications);
  await db.delete(gameEvents);
  await db.delete(matches);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

async function seedEvent(serverId: number) {
  const [match] = await db
    .insert(matches)
    .values({ serverId, map: "Sandstorm", experiences: ["TeamDeathmatch"], startedAt: new Date() })
    .returning();
  const [event] = await db
    .insert(gameEvents)
    .values({
      serverId,
      matchId: match.id,
      type: "MatchStarted",
      timestamp: new Date(),
      idempotencyKey: `recent-notifications-test-${crypto.randomUUID()}`,
      sourceSnapshotId: 0,
    })
    .returning();
  return event.id;
}

describe("getRecentNotifications", () => {
  it("returns nothing when the Server has no Notification rows", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: "http://rcon.test:9006" })
      .returning();

    const result = await getRecentNotifications(db, server.id);

    expect(result).toEqual([]);
  });

  it("returns the Server's Notifications, most recent first, scoped away from other Servers", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: "http://rcon.test:9006" })
      .returning();
    const [otherServer] = await db
      .insert(servers)
      .values({ name: "Other Server", baseUrl: "http://other.test:9006" })
      .returning();
    const eventId = await seedEvent(server.id);
    const otherEventId = await seedEvent(otherServer.id);

    const [older, newer] = await db
      .insert(notifications)
      .values([
        {
          serverId: server.id,
          priority: "high",
          message: "Match started on Sandstorm",
          eventId,
          timestamp: new Date("2026-03-05T12:00:00Z"),
        },
        {
          serverId: server.id,
          priority: "normal",
          message: "Alice reached a 5-kill streak",
          eventId,
          timestamp: new Date("2026-03-05T12:05:00Z"),
        },
      ])
      .returning();
    await db.insert(notifications).values({
      serverId: otherServer.id,
      priority: "high",
      message: "Match started elsewhere",
      eventId: otherEventId,
      timestamp: new Date("2026-03-05T12:10:00Z"),
    });

    const result = await getRecentNotifications(db, server.id);

    expect(result).toEqual([
      {
        id: newer.id,
        priority: "normal",
        message: "Alice reached a 5-kill streak",
        timestamp: newer.timestamp.toISOString(),
      },
      {
        id: older.id,
        priority: "high",
        message: "Match started on Sandstorm",
        timestamp: older.timestamp.toISOString(),
      },
    ]);
  });

  it("caps the result at the given limit", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: "http://rcon.test:9006" })
      .returning();
    const eventId = await seedEvent(server.id);

    await db.insert(notifications).values(
      Array.from({ length: 5 }, (_, index) => ({
        serverId: server.id,
        priority: "normal" as const,
        message: `Event ${index}`,
        eventId,
        timestamp: new Date(2026, 2, 5, 12, index),
      })),
    );

    const result = await getRecentNotifications(db, server.id, 2);

    expect(result).toHaveLength(2);
  });
});
