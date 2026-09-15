import {
  challengeDefinitions,
  challengeInstances,
  createDb,
  gameEvents,
  latestSnapshots,
  matches,
  notifications,
  servers,
  type Database,
} from "@wdza-stats/db";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { snapshotFixture } from "@/lib/live-snapshot-fixture";
import HomePage from "./page";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = process.env.RCON_BASE_URL!;

afterEach(async () => {
  await db.delete(notifications);
  await db.delete(gameEvents);
  await db.delete(matches);
  await db.delete(challengeInstances);
  await db.delete(challengeDefinitions);
  await db.delete(latestSnapshots);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

describe("HomePage", () => {
  it("renders the configured Server's latest Snapshot", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();
    await db.insert(latestSnapshots).values({
      serverId: server.id,
      capturedAt: new Date("2026-01-01T00:00:00.000Z"),
      payload: snapshotFixture({
        map: "Deadcity",
        factions: [
          { name: "Lonestar", color: "#ff0000", score: 42 },
          { name: "Valkyra", color: "#0000ff", score: 37 },
        ],
        players: [
          {
            steamId: "1",
            displayName: "Alice",
            faction: "Lonestar",
            kills: 12,
            deaths: 4,
            cash: 1500,
            ping: 38,
          },
        ],
      }),
    });

    const element = await HomePage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("WDZA Test");
    expect(html).toContain("Deadcity");
    expect(html).toContain("Lonestar");
    expect(html).toContain("#ff0000");
    expect(html).toContain("42");
    expect(html).toContain("Valkyra");
    expect(html).toContain("37");
    expect(html).toContain("Alice");
    expect(html).toContain("12");
    expect(html).toContain("4");
    expect(html).toContain("1500");
    expect(html).toContain("38");
  });

  it("renders the current and next map from the Server's rotation state", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();
    await db.insert(latestSnapshots).values({
      serverId: server.id,
      capturedAt: new Date("2026-01-01T00:00:00.000Z"),
      payload: snapshotFixture({
        map: "Deadcity",
        rotation: {
          nowIndex: 1,
          entries: [{ map: "Sandstorm" }, { map: "Deadcity" }, { map: "Frontier" }],
        },
      }),
    });

    const element = await HomePage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Rotation:");
    expect(html).toContain(">Deadcity</span> (current)");
    expect(html).toContain(">Frontier</span>");
    expect(html).toContain("(next)");
  });

  it("renders a waiting message when no live Snapshot exists yet", async () => {
    const element = await HomePage();
    const html = renderToStaticMarkup(element);

    expect(html.toLowerCase()).toContain("no live data");
  });

  it("renders active daily challenges and the recent-events feed alongside the existing live view content", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();
    const capturedAt = new Date("2026-03-05T12:00:00.000Z");
    await db.insert(latestSnapshots).values({
      serverId: server.id,
      capturedAt,
      payload: snapshotFixture({ map: "Deadcity" }),
    });

    const [definition] = await db
      .insert(challengeDefinitions)
      .values({ type: "kills", scope: "daily", target: 20, xpReward: 150 })
      .returning();
    await db
      .insert(challengeInstances)
      .values({ definitionId: definition.id, serverId: server.id, periodKey: "2026-03-05" });

    const [match] = await db
      .insert(matches)
      .values({ serverId: server.id, map: "Deadcity", experiences: ["TeamDeathmatch"], startedAt: capturedAt })
      .returning();
    const [event] = await db
      .insert(gameEvents)
      .values({
        serverId: server.id,
        matchId: match.id,
        type: "MatchStarted",
        timestamp: capturedAt,
        idempotencyKey: "page-test-match-started",
        sourceSnapshotId: 0,
      })
      .returning();
    await db.insert(notifications).values({
      serverId: server.id,
      priority: "high",
      message: "Match started on Deadcity",
      eventId: event.id,
      timestamp: capturedAt,
    });

    const element = await HomePage();
    const html = renderToStaticMarkup(element);

    // Existing live view content is unaffected by the new sections.
    expect(html).toContain("WDZA Test");
    expect(html).toContain("Deadcity");

    expect(html).toContain("Today&#x27;s challenges");
    expect(html).toContain("Get 20 kills");
    expect(html).toContain("+150 XP");

    expect(html).toContain("Recent activity");
    expect(html).toContain("Match started on Deadcity");
  });
});
