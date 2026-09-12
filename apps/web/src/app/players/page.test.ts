import {
  createDb,
  playerCareerStats,
  servers,
  type Database,
} from "@wdza-stats/db";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import PlayerSearchPage from "./page";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = process.env.RCON_BASE_URL!;

afterEach(async () => {
  await db.delete(playerCareerStats);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

async function renderPage(searchParams: { q?: string } = {}) {
  const element = await PlayerSearchPage({
    searchParams: Promise.resolve(searchParams),
  });
  return renderToStaticMarkup(element);
}

describe("PlayerSearchPage", () => {
  it("renders no results before any search is made", async () => {
    const html = await renderPage();

    expect(html).not.toContain("No players found");
  });

  it("renders a not-found message when the query matches nobody", async () => {
    const html = await renderPage({ q: "nobody" });

    expect(html).toContain("No players found matching &quot;nobody&quot;.");
  });

  it("renders matching players as links to their player page", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(playerCareerStats).values({
      serverId: server.id,
      steamId: "1",
      displayName: "Alice",
      kills: 10,
      deaths: 2,
      cash: 100,
      matchesPlayed: 1,
    });

    const html = await renderPage({ q: "ali" });

    expect(html).toContain("Alice");
    expect(html).toContain("/players/1");
  });
});
