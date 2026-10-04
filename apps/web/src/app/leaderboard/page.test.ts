import {
  createDb,
  currentSeason,
  playerCareerStats,
  playerSeasonStats,
  seasons,
  servers,
  steamProfiles,
  type Database,
} from "@wdza-stats/db";
import { gt } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import LeaderboardPage from "./page";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = process.env.RCON_BASE_URL!;
const NOT_FOUND = /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/;

// Season 1 comes from the migration; tests add Seasons above it.
let baseline: number;

beforeAll(async () => {
  baseline = (await currentSeason(db)).number;
});

afterEach(async () => {
  await db.delete(playerSeasonStats);
  await db.delete(seasons).where(gt(seasons.number, baseline));
  await db.delete(playerCareerStats);
  await db.delete(servers);
  await db.delete(steamProfiles);
});

afterAll(async () => {
  await db.$client.end();
});

async function renderPage(searchParams: { sort?: string; season?: string } = {}) {
  const element = await LeaderboardPage({
    searchParams: Promise.resolve(searchParams),
  });
  return renderToStaticMarkup(element);
}

// Links in the markup are HTML-escaped.
const href = (url: string) => `href="${url.replaceAll("&", "&amp;")}"`;

describe("LeaderboardPage", () => {
  describe("Career", () => {
    it("renders a message when there are no PlayerCareerStat rows yet", async () => {
      const html = await renderPage({ season: "career" });

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

      const html = await renderPage({ season: "career" });

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

      const html = await renderPage({ season: "career", sort: "cash" });

      expect(html.indexOf("Alice")).toBeLessThan(html.indexOf("Bob"));
    });

    it("ranks players by playtime and formats it as whole hours", async () => {
      const [server] = await db
        .insert(servers)
        .values({ name: "WDZA Test", baseUrl: BASE_URL })
        .returning();

      await db.insert(playerCareerStats).values([
        { serverId: server.id, steamId: "1", displayName: "Alice", kills: 1, deaths: 1, cash: 0, matchesPlayed: 1 },
        { serverId: server.id, steamId: "2", displayName: "Bob", kills: 1, deaths: 1, cash: 0, matchesPlayed: 1 },
      ]);
      await db.insert(steamProfiles).values([
        {
          steamId: "1",
          personaName: null,
          avatarUrl: null,
          achievements: [],
          playtimeMinutes: 120,
          status: "ok",
          fetchedAt: new Date(),
        },
        {
          steamId: "2",
          personaName: null,
          avatarUrl: null,
          achievements: [],
          playtimeMinutes: 6000,
          status: "ok",
          fetchedAt: new Date(),
        },
      ]);

      const html = await renderPage({ season: "career", sort: "playtime" });

      expect(html.indexOf("Bob")).toBeLessThan(html.indexOf("Alice"));
      expect(html).toContain("100h");
      expect(html).toContain("2h");
    });
  });

  describe("Seasons", () => {
    async function seedTwoSeasons() {
      const [server] = await db
        .insert(servers)
        .values({ name: "WDZA Test", baseUrl: BASE_URL })
        .returning();
      const past = await currentSeason(db);
      const [current] = await db
        .insert(seasons)
        .values({ number: baseline + 1, name: "Dust Storm" })
        .returning();

      await db.insert(playerCareerStats).values([
        { serverId: server.id, steamId: "1", displayName: "Alice", kills: 60, deaths: 10, cash: 900, matchesPlayed: 6 },
        { serverId: server.id, steamId: "2", displayName: "Bob", kills: 20, deaths: 10, cash: 100, matchesPlayed: 3 },
      ]);
      await db.insert(playerSeasonStats).values([
        { seasonId: past.id, serverId: server.id, steamId: "1", kills: 60, deaths: 10, cash: 900, matchesPlayed: 6 },
        { seasonId: past.id, serverId: server.id, steamId: "2", kills: 15, deaths: 8, cash: 60, matchesPlayed: 2 },
        // Only Bob has played this Season.
        { seasonId: current.id, serverId: server.id, steamId: "2", kills: 5, deaths: 2, cash: 40, matchesPlayed: 1 },
      ]);
      return { past, current };
    }

    it("shows the current Season by default, without players who haven't played in it", async () => {
      await seedTwoSeasons();

      const html = await renderPage();

      expect(html).toContain("Bob");
      expect(html).not.toContain("Alice");
    });

    it("offers the current Season, past Seasons, and Career, keeping the sort", async () => {
      const { past, current } = await seedTwoSeasons();

      const html = await renderPage({ sort: "cash" });

      expect(html).toContain(href(`/leaderboard?season=${current.number}&sort=cash`));
      expect(html).toContain(href(`/leaderboard?season=${past.number}&sort=cash`));
      expect(html).toContain(href("/leaderboard?season=career&sort=cash"));
      expect(html).toContain(`Season ${current.number} · Dust Storm`);
    });

    it("keeps the chosen Season when changing the sort", async () => {
      const { past } = await seedTwoSeasons();

      const html = await renderPage({ season: String(past.number) });

      expect(html).toContain(href(`/leaderboard?season=${past.number}&sort=kd`));
      expect(html.indexOf("Alice")).toBeLessThan(html.indexOf("Bob"));
    });

    it("labels playtime as all-time in a Season view, since it isn't kept per Season", async () => {
      await seedTwoSeasons();

      expect(await renderPage()).toContain("Playtime (all-time)");
      expect(await renderPage({ season: "career" })).not.toContain("Playtime (all-time)");
    });

    it("says so when nobody has played in the Season yet", async () => {
      const [server] = await db
        .insert(servers)
        .values({ name: "WDZA Test", baseUrl: BASE_URL })
        .returning();
      const [current] = await db.insert(seasons).values({ number: baseline + 1 }).returning();
      await db.insert(playerCareerStats).values({ serverId: server.id, steamId: "1", displayName: "Alice", kills: 1 });

      const html = await renderPage();

      expect(html).toContain(`No players have played a Match in Season ${current.number} yet.`);
      expect(html).not.toContain("Alice");
    });

    it("is not found for a Season that doesn't exist", async () => {
      await expect(renderPage({ season: String(baseline + 5) })).rejects.toThrow(NOT_FOUND);
    });
  });
});
