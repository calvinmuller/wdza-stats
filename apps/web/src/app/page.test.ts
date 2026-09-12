import { createDb, latestSnapshots, servers, type Database } from "@wdza-stats/db";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { snapshotFixture } from "@/lib/live-snapshot-fixture";
import HomePage from "./page";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = process.env.RCON_BASE_URL!;

afterEach(async () => {
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

  it("renders a waiting message when no live Snapshot exists yet", async () => {
    const element = await HomePage();
    const html = renderToStaticMarkup(element);

    expect(html.toLowerCase()).toContain("no live data");
  });
});
