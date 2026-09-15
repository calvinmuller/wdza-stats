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
import MatchDetailPage from "./page";

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

async function renderPage(id: string) {
  const element = await MatchDetailPage({ params: Promise.resolve({ id }) });
  return renderToStaticMarkup(element);
}

describe("MatchDetailPage", () => {
  it("calls notFound for a non-integer id", async () => {
    await expect(renderPage("bogus")).rejects.toThrow();
  });

  it("calls notFound for an unknown match id", async () => {
    await expect(renderPage("999")).rejects.toThrow();
  });

  it("renders map, winner, MVP, and per-player stats for a seeded Match", async () => {
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

    await db.insert(playerCareerStats).values([
      { serverId: server.id, steamId: "1", displayName: "Alice", matchesPlayed: 1 },
      { serverId: server.id, steamId: "2", displayName: "Bob", matchesPlayed: 1 },
    ]);

    await db.insert(playerMatchStats).values([
      { matchId: match.id, steamId: "1", faction: "Lonestar", kills: 5, deaths: 2, cash: 100 },
      { matchId: match.id, steamId: "2", faction: "Valkyra", kills: 3, deaths: 4, cash: 50 },
    ]);

    const html = await renderPage(String(match.id));

    expect(html).toContain("Foundry");
    expect(html).toContain("Lonestar");
    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
    expect(html.indexOf("Alice")).toBeLessThan(html.indexOf("Bob"));
  });
});
