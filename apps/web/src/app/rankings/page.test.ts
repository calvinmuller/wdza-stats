import {
  createDb,
  playerCareerStats,
  servers,
  type Database,
} from "@wdza-stats/db";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { RANKINGS_PAGE_SIZE } from "@/lib/rankings";
import RankingsPage from "./page";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = process.env.RCON_BASE_URL!;

afterEach(async () => {
  await db.delete(playerCareerStats);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

async function renderPage(searchParams: { metric?: string; page?: string } = {}) {
  const element = await RankingsPage({ searchParams: Promise.resolve(searchParams) });
  return renderToStaticMarkup(element);
}

describe("RankingsPage", () => {
  it("renders a message when there are no PlayerCareerStat rows yet", async () => {
    const html = await renderPage();

    expect(html.toLowerCase()).toContain("no players");
  });

  it("ranks players by XP by default", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(playerCareerStats).values([
      { serverId: server.id, steamId: "1", displayName: "Alice", xp: 100 },
      { serverId: server.id, steamId: "2", displayName: "Bob", xp: 5000 },
    ]);

    const html = await renderPage();

    expect(html.indexOf("Bob")).toBeLessThan(html.indexOf("Alice"));
    expect(html).toContain("/players/1");
    expect(html).toContain("/players/2");
  });

  it("ranks players by the requested metric", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(playerCareerStats).values([
      { serverId: server.id, steamId: "1", displayName: "Alice", xp: 5000, matchesWon: 1 },
      { serverId: server.id, steamId: "2", displayName: "Bob", xp: 100, matchesWon: 20 },
    ]);

    const html = await renderPage({ metric: "wins" });

    expect(html.indexOf("Bob")).toBeLessThan(html.indexOf("Alice"));
  });

  it("shows pagination controls only when there's more than one page", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    const single = await renderPage();
    expect(single).not.toContain("Page 1 of");

    await db.insert(playerCareerStats).values(
      Array.from({ length: RANKINGS_PAGE_SIZE + 1 }, (_, index) => ({
        serverId: server.id,
        steamId: `p${index}`,
        displayName: `Player ${index}`,
        xp: index,
      })),
    );

    const multi = await renderPage();
    expect(multi).toContain("Page 1 of 2");
  });
});
