import {
  createDb,
  playerCareerStats,
  servers,
  type Database,
} from "@wdza-stats/db";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import PlayerPage from "./page";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = process.env.RCON_BASE_URL!;

afterEach(async () => {
  await db.delete(playerCareerStats);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

async function renderPage(steamId: string) {
  const element = await PlayerPage({ params: Promise.resolve({ steamId }) });
  return renderToStaticMarkup(element);
}

describe("PlayerPage", () => {
  it("renders a not-found message for an unknown steamId", async () => {
    const html = await renderPage("unknown");

    expect(html.toLowerCase()).toContain("no player found");
  });

  it("renders the player's all-time totals", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    await db.insert(playerCareerStats).values({
      serverId: server.id,
      steamId: "1",
      displayName: "Alice",
      kills: 30,
      deaths: 6,
      cash: 2500,
      matchesPlayed: 4,
    });

    const html = await renderPage("1");

    expect(html).toContain("Alice");
    expect(html).toContain("30");
    expect(html).toContain("6");
    expect(html).toContain("5.00");
    expect(html).toContain("2500");
    expect(html).toContain("4");
  });
});
