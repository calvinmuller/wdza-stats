import {
  createDb,
  currentSeason,
  kills,
  playerCareerStats,
  seasons,
  servers,
  type Database,
} from "@wdza-stats/db";
import { gt } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import WeaponsPage from "./page";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = process.env.RCON_BASE_URL!;
const NOT_FOUND = /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/;

// Season 1 comes from the migration; tests add Seasons above it.
let baseline: number;

beforeAll(async () => {
  baseline = (await currentSeason(db)).number;
});

afterEach(async () => {
  await db.delete(kills);
  await db.delete(seasons).where(gt(seasons.number, baseline));
  await db.delete(playerCareerStats);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

const ALICE = "76561198000000001";
const BOB = "76561198000000002";

async function seedServer() {
  const [server] = await db.insert(servers).values({ name: "WDZA Test", baseUrl: BASE_URL }).returning();
  return server;
}

let eventSeq = 0;

async function seedKill(serverId: number, kill: Partial<typeof kills.$inferInsert> = {}) {
  eventSeq += 1;
  await db.insert(kills).values({
    serverId,
    eventId: `event-${eventSeq}`,
    instanceId: "boot",
    gameMatchId: "game-match",
    eventTime: eventSeq,
    map: "Kavkazi",
    killerSteamId: ALICE,
    killerName: "Alice",
    victimSteamId: BOB,
    victimName: "Bob",
    cause: "Id.Item.AK74M",
    tags: [],
    ...kill,
  });
}

async function renderPage(searchParams: { weapon?: string; window?: string } = {}) {
  const element = await WeaponsPage({ searchParams: Promise.resolve(searchParams) });
  return renderToStaticMarkup(element);
}

// Links in the markup are HTML-escaped.
const href = (url: string) => `href="${url.replaceAll("&", "&amp;")}"`;

describe("WeaponsPage", () => {
  it("says so when the feed has never delivered a Kill", async () => {
    await seedServer();

    const html = await renderPage();

    expect(html).toContain("No kills recorded by the kill feed yet.");
    expect(html).not.toContain("<select");
  });

  it("defaults to the last 7 days and the most-used weapon, ranking its killers", async () => {
    const server = await seedServer();
    await db.insert(playerCareerStats).values({ serverId: server.id, steamId: ALICE, displayName: "Alice Career" });
    await seedKill(server.id, { cause: "Id.Item.SVDM" });
    await seedKill(server.id, { cause: "Id.Item.AK74M" });
    await seedKill(server.id, { cause: "Id.Item.AK74M", killerSteamId: BOB, killerName: "Bob", victimSteamId: ALICE });

    const html = await renderPage();

    expect(html).toContain('aria-current="page"');
    expect(html).toContain(">Last 7 days</a>");
    expect(html).toContain("2 kills by 2 players in the last 7 days");
    expect(html).toContain('<option value="ak74" selected="">AK74</option>');
    expect(html).toContain('<option value="svd">SVD</option>');
    expect(html).toContain("Alice Career");
    expect(html).toContain("Bob");
    expect(html).toContain(href(`/players/${ALICE}`));
    // Switching the scope keeps the weapon.
    expect(html).toContain(href("/weapons?window=30d&weapon=ak74"));
  });

  it("shows the chosen weapon and scope from the URL", async () => {
    const server = await seedServer();
    await seedKill(server.id, { cause: "Id.Item.AK74M" });
    await seedKill(server.id, { cause: "Id.Item.SVDM", headshot: true });

    const html = await renderPage({ weapon: "svd", window: "all" });

    expect(html).toContain('<option value="svd" selected="">SVD</option>');
    expect(html).toContain("1 kill by 1 player all time");
    expect(html).toContain('<input type="hidden" name="window" value="all"/>');
  });

  it("tells the visitor when the weapon has no Kills in the scope", async () => {
    const server = await seedServer();
    const current = await currentSeason(db);
    await seedKill(server.id, { cause: "Id.Item.AK74M", receivedAt: new Date("2026-01-01T00:00:00.000Z") });

    const week = await renderPage({ weapon: "ak74" });
    const season = await renderPage({ weapon: "ak74", window: "season" });

    expect(week).toContain("Nobody got a kill with the AK74 in the last 7 days.");
    expect(season).toContain(`Nobody got a kill with the AK74 in Season ${current.number}.`);
  });

  it("is not found for a weapon nobody has used or an unknown window", async () => {
    const server = await seedServer();
    await seedKill(server.id);

    await expect(renderPage({ weapon: "m4" })).rejects.toThrow(NOT_FOUND);
    await expect(renderPage({ window: "year" })).rejects.toThrow(NOT_FOUND);
  });
});
