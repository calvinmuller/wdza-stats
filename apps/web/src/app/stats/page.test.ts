import {
  createDb,
  currentSeason,
  matches,
  playerCareerStats,
  playerSeasonStats,
  seasons,
  servers,
  type Database,
} from "@wdza-stats/db";
import { gt } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import StatsPage from "./page";

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
  await db.delete(playerCareerStats);
  await db.delete(matches);
  await db.delete(seasons).where(gt(seasons.number, baseline));
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

async function renderPage(searchParams: { season?: string } = {}) {
  const element = await StatsPage({ searchParams: Promise.resolve(searchParams) });
  return renderToStaticMarkup(element);
}

// One stat tile, e.g. tile("Total kills", 30), as the page renders it.
const tile = (label: string, value: string | number) =>
  new RegExp(`>${label}</dt><dd[^>]*>${value}</dd>`);

async function seedTwoSeasons() {
  const [server] = await db
    .insert(servers)
    .values({ name: "WDZA Test", baseUrl: BASE_URL })
    .returning();
  const past = await currentSeason(db);
  const [current] = await db.insert(seasons).values({ number: baseline + 1, name: "Dust Storm" }).returning();

  const closedMatch = (seasonId: number) => ({
    serverId: server.id,
    seasonId,
    map: "Foundry",
    experiences: ["Frontline"],
    startedAt: new Date("2026-01-01T00:00:00.000Z"),
    endedAt: new Date("2026-01-01T00:30:00.000Z"),
  });
  await db.insert(matches).values([closedMatch(past.id), closedMatch(past.id), closedMatch(current.id)]);
  await db.insert(playerCareerStats).values({
    serverId: server.id,
    steamId: "1",
    displayName: "Alice",
    kills: 30,
    deaths: 6,
    matchesPlayed: 3,
  });
  await db.insert(playerSeasonStats).values([
    { seasonId: past.id, serverId: server.id, steamId: "1", kills: 21, deaths: 5, matchesPlayed: 2 },
    { seasonId: current.id, serverId: server.id, steamId: "1", kills: 9, deaths: 1, matchesPlayed: 1 },
  ]);
  return { past, current };
}

describe("StatsPage", () => {
  it("shows the current Season's totals by default", async () => {
    await seedTwoSeasons();

    const html = await renderPage();

    expect(html).toMatch(tile("Matches played", 1));
    expect(html).toMatch(tile("Total kills", 9));
  });

  it("shows a past Season's totals, and Career's, when picked", async () => {
    const { past } = await seedTwoSeasons();

    expect(await renderPage({ season: String(past.number) })).toMatch(tile("Total kills", 21));

    const career = await renderPage({ season: "career" });
    expect(career).toMatch(tile("Matches played", 3));
    expect(career).toMatch(tile("Total kills", 30));
  });

  it("offers the current Season, past Seasons, and Career", async () => {
    const { past, current } = await seedTwoSeasons();

    const html = await renderPage();

    expect(html).toContain(`href="/stats?season=${current.number}"`);
    expect(html).toContain(`href="/stats?season=${past.number}"`);
    expect(html).toContain('href="/stats?season=career"');
    expect(html).toContain(`Season ${current.number} · Dust Storm`);
  });

  it("is not found for a Season that doesn't exist", async () => {
    await expect(renderPage({ season: String(baseline + 5) })).rejects.toThrow(NOT_FOUND);
  });
});
