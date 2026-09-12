import {
  createDb,
  playerCareerStats,
  servers,
  type Database,
} from "@wdza-stats/db";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import LeaderboardPage from "./page";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = process.env.RCON_BASE_URL!;

afterEach(async () => {
  await db.delete(playerCareerStats);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

async function renderPage(searchParams: { sort?: string } = {}) {
  const element = await LeaderboardPage({
    searchParams: Promise.resolve(searchParams),
  });
  return renderToStaticMarkup(element);
}

describe("LeaderboardPage", () => {
  it("renders a message when there are no PlayerCareerStat rows yet", async () => {
    const html = await renderPage();

    expect(html.toLowerCase()).toContain("no players");
  });

  it("ranks players by kills by default", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(playerCareerStats).values([
      {
        serverId: server.id,
        steamId: "1",
        displayName: "Alice",
        kills: 5,
        deaths: 1,
        cash: 900,
        matchesPlayed: 2,
      },
      {
        serverId: server.id,
        steamId: "2",
        displayName: "Bob",
        kills: 50,
        deaths: 1,
        cash: 100,
        matchesPlayed: 2,
      },
    ]);

    const html = await renderPage();

    expect(html.indexOf("Bob")).toBeLessThan(html.indexOf("Alice"));
    expect(html).toContain("/players/1");
    expect(html).toContain("/players/2");
  });

  it("ranks players by the requested sort", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(playerCareerStats).values([
      {
        serverId: server.id,
        steamId: "1",
        displayName: "Alice",
        kills: 5,
        deaths: 1,
        cash: 900,
        matchesPlayed: 2,
      },
      {
        serverId: server.id,
        steamId: "2",
        displayName: "Bob",
        kills: 50,
        deaths: 1,
        cash: 100,
        matchesPlayed: 2,
      },
    ]);

    const html = await renderPage({ sort: "cash" });

    expect(html.indexOf("Alice")).toBeLessThan(html.indexOf("Bob"));
  });
});
