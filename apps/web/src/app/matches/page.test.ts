import {
  createDb,
  matches,
  playerCareerStats,
  playerMatchStats,
  servers,
  type Database,
} from "@wdza-stats/db";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { MATCHES_PAGE_SIZE } from "@/lib/match-history";
import MatchesPage from "./page";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = process.env.RCON_BASE_URL!;

afterEach(async () => {
  await db.delete(playerMatchStats);
  await db.delete(playerCareerStats);
  await db.delete(matches);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

async function renderPage(searchParams: { page?: string } = {}) {
  const element = await MatchesPage({ searchParams: Promise.resolve(searchParams) });
  return renderToStaticMarkup(element);
}

describe("MatchesPage", () => {
  it("renders a message when there are no closed Matches yet", async () => {
    const html = await renderPage();

    expect(html.toLowerCase()).toContain("no matches");
  });

  it("renders map, winner, and MVP for a closed Match", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    const [match] = await db
      .insert(matches)
      .values({
        serverId: server.id,
        map: "Foundry",
        experiences: ["Frontline"],
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        endedAt: new Date("2026-01-01T00:30:00.000Z"),
        winningFaction: "Lonestar",
        mvpPlayerSteamId: "1",
        mvpScore: 40,
      })
      .returning();

    await db.insert(playerCareerStats).values({
      serverId: server.id,
      steamId: "1",
      displayName: "Alice",
      matchesPlayed: 1,
    });

    await db.insert(playerMatchStats).values({
      matchId: match.id,
      steamId: "1",
      faction: "Lonestar",
      kills: 5,
      deaths: 2,
      cash: 100,
    });

    const html = await renderPage();

    expect(html).toContain("Foundry");
    expect(html).toContain("Lonestar");
    expect(html).toContain("Alice");
    expect(html).toContain(`/matches/${match.id}`);
    expect(html).toContain("/players/1");
  });

  it("shows pagination controls only when there's more than one page", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();

    const single = await renderPage();
    expect(single).not.toContain("Page 1 of");

    await db.insert(matches).values(
      Array.from({ length: MATCHES_PAGE_SIZE + 1 }, (_, index) => ({
        serverId: server.id,
        map: `Map ${index}`,
        experiences: ["Frontline"],
        startedAt: new Date(Date.UTC(2026, 0, index + 1, 0, 0, 0)),
        endedAt: new Date(Date.UTC(2026, 0, index + 1, 0, 30, 0)),
      })),
    );

    const multi = await renderPage();
    expect(multi).toContain("Page 1 of 2");
  });
});
