import {
  createDb,
  currentSeason,
  playerCareerStats,
  playerSeasonStats,
  seasons,
  servers,
  type Database,
} from "@wdza-stats/db";
import { gt } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { RANKINGS_PAGE_SIZE } from "@/lib/rankings";
import RankingsPage from "./page";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = process.env.RCON_BASE_URL!;
const SLUG = "wdza-test";
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
});

afterAll(async () => {
  await db.$client.end();
});

type SearchParams = { metric?: string; page?: string; season?: string };

async function renderPage(searchParams: SearchParams = {}) {
  const element = await RankingsPage({ params: Promise.resolve({ server: SLUG }), searchParams: Promise.resolve(searchParams) });
  return renderToStaticMarkup(element);
}

// Links in the markup are HTML-escaped.
// A link to one of the Server's own pages, as the page renders it.
const href = (path: string) => `href="/servers/${SLUG}${path.replaceAll("&", "&amp;")}"`;

describe("RankingsPage", () => {
  describe("Career", () => {
    it("renders a message when there are no PlayerCareerStat rows yet", async () => {
      await db.insert(servers).values({ name: "WDZA Test", slug: SLUG, baseUrl: BASE_URL });
      const html = await renderPage({ season: "career" });

      expect(html.toLowerCase()).toContain("no players");
    });

    it("ranks players by XP by default", async () => {
      const [server] = await db
        .insert(servers)
        .values({ name: "WDZA Test", slug: SLUG, baseUrl: BASE_URL })
        .returning();

      await db.insert(playerCareerStats).values([
        { serverId: server.id, steamId: "1", displayName: "Alice", xp: 100 },
        { serverId: server.id, steamId: "2", displayName: "Bob", xp: 5000 },
      ]);

      const html = await renderPage({ season: "career" });

      expect(html.indexOf("Bob")).toBeLessThan(html.indexOf("Alice"));
      expect(html).toContain(`/servers/${SLUG}/players/1`);
      expect(html).toContain(`/servers/${SLUG}/players/2`);
    });

    it("ranks players by the requested metric", async () => {
      const [server] = await db
        .insert(servers)
        .values({ name: "WDZA Test", slug: SLUG, baseUrl: BASE_URL })
        .returning();

      await db.insert(playerCareerStats).values([
        { serverId: server.id, steamId: "1", displayName: "Alice", xp: 5000, matchesWon: 1 },
        { serverId: server.id, steamId: "2", displayName: "Bob", xp: 100, matchesWon: 20 },
      ]);

      const html = await renderPage({ season: "career", metric: "wins" });

      expect(html.indexOf("Bob")).toBeLessThan(html.indexOf("Alice"));
    });

    it("shows pagination controls only when there's more than one page, keeping the Season", async () => {
      const [server] = await db
        .insert(servers)
        .values({ name: "WDZA Test", slug: SLUG, baseUrl: BASE_URL })
        .returning();

      const single = await renderPage({ season: "career" });
      expect(single).not.toContain("Page 1 of");

      await db.insert(playerCareerStats).values(
        Array.from({ length: RANKINGS_PAGE_SIZE + 1 }, (_, index) => ({
          serverId: server.id,
          steamId: `p${index}`,
          displayName: `Player ${index}`,
          xp: index,
        })),
      );

      const multi = await renderPage({ season: "career" });
      expect(multi).toContain("Page 1 of 2");
      expect(multi).toContain(href("/rankings?season=career&metric=xp&page=2"));
    });
  });

  describe("Seasons", () => {
    async function seedTwoSeasons() {
      const [server] = await db
        .insert(servers)
        .values({ name: "WDZA Test", slug: SLUG, baseUrl: BASE_URL })
        .returning();
      const past = await currentSeason(db);
      const [current] = await db
        .insert(seasons)
        .values({ number: baseline + 1, name: "Dust Storm" })
        .returning();

      await db.insert(playerCareerStats).values([
        { serverId: server.id, steamId: "1", displayName: "Alice", xp: 5000, matchesPlayed: 4 },
        { serverId: server.id, steamId: "2", displayName: "Bob", xp: 900, matchesPlayed: 3 },
      ]);
      await db.insert(playerSeasonStats).values([
        { seasonId: past.id, serverId: server.id, steamId: "1", xp: 5000, matchesPlayed: 4 },
        { seasonId: past.id, serverId: server.id, steamId: "2", xp: 600, matchesPlayed: 2 },
        // Only Bob has played this Season.
        { seasonId: current.id, serverId: server.id, steamId: "2", xp: 300, matchesPlayed: 1 },
      ]);
      return { past, current };
    }

    it("shows the current Season by default, without players who haven't played in it", async () => {
      await seedTwoSeasons();

      const html = await renderPage();

      expect(html).toContain("Bob");
      expect(html).not.toContain("Alice");
    });

    it("offers the current Season, past Seasons newest first, and Career, each as a shareable link", async () => {
      const { past, current } = await seedTwoSeasons();

      const html = await renderPage({ metric: "kills" });

      const currentLink = html.indexOf(href(`/rankings?season=${current.number}&metric=kills`));
      const pastLink = html.indexOf(href(`/rankings?season=${past.number}&metric=kills`));
      const careerLink = html.indexOf(href("/rankings?season=career&metric=kills"));
      expect(currentLink).toBeGreaterThan(-1);
      expect(pastLink).toBeGreaterThan(currentLink);
      expect(careerLink).toBeGreaterThan(pastLink);
      expect(html).toContain(`Season ${current.number} · Dust Storm`);
      expect(html).toContain(`Season ${past.number}`);
    });

    it("keeps the chosen Season when switching metric", async () => {
      const { past } = await seedTwoSeasons();

      const html = await renderPage({ season: String(past.number) });

      expect(html).toContain(href(`/rankings?season=${past.number}&metric=wins`));
      expect(html.indexOf("Alice")).toBeLessThan(html.indexOf("Bob"));
    });

    it("shows Career when it's selected", async () => {
      await seedTwoSeasons();

      const html = await renderPage({ season: "career" });

      expect(html.indexOf("Alice")).toBeGreaterThan(-1);
      expect(html.indexOf("Alice")).toBeLessThan(html.indexOf("Bob"));
    });

    it("says so when nobody has played in the Season yet", async () => {
      const [server] = await db
        .insert(servers)
        .values({ name: "WDZA Test", slug: SLUG, baseUrl: BASE_URL })
        .returning();
      const [current] = await db.insert(seasons).values({ number: baseline + 1 }).returning();
      await db.insert(playerCareerStats).values({ serverId: server.id, steamId: "1", displayName: "Alice", xp: 10 });

      const html = await renderPage();

      expect(html).toContain(`No players have played a Match in Season ${current.number} yet.`);
      expect(html).not.toContain("Alice");
    });

    it("is not found for a Season that doesn't exist", async () => {
      await expect(renderPage({ season: String(baseline + 5) })).rejects.toThrow(NOT_FOUND);
    });
  });
});
