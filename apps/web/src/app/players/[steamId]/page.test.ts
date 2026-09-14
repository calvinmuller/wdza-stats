import {
  createDb,
  playerCareerStats,
  servers,
  steamAchievementSchema,
  steamProfiles,
  WARDOGS_STEAM_APP_ID,
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
  await db.delete(steamProfiles);
  await db.delete(steamAchievementSchema);
});

afterAll(async () => {
  await db.$client.end();
});

async function renderPage(steamId: string) {
  const element = await PlayerPage({ params: Promise.resolve({ steamId }) });
  return renderToStaticMarkup(element);
}

async function seedPlayer(steamId: string, displayName: string) {
  const [server] = await db
    .insert(servers)
    .values({ name: "WDZA Test", baseUrl: BASE_URL })
    .returning();

  await db.insert(playerCareerStats).values({
    serverId: server.id,
    steamId,
    displayName,
    kills: 1,
    deaths: 1,
    cash: 100,
    matchesPlayed: 1,
  });
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

describe("PlayerPage Steam enrichment", () => {
  it("renders the avatar, persona name, and achievement badges when a SteamProfile is cached", async () => {
    await seedPlayer("1", "Alice");
    await db.insert(steamAchievementSchema).values({
      appId: WARDOGS_STEAM_APP_ID,
      apiName: "THIS_IS_WARDOGS",
      displayName: "This is WARDOGS",
      description: "Play your first match.",
      iconUrl: "https://example.com/icon.jpg",
    });
    await db.insert(steamProfiles).values({
      steamId: "1",
      personaName: "CoolGuy123",
      avatarUrl: "https://example.com/avatar.jpg",
      achievements: [{ apiName: "THIS_IS_WARDOGS", unlockedAt: "2026-09-10T00:00:00.000Z" }],
      status: "ok",
      fetchedAt: new Date(),
    });

    const html = await renderPage("1");

    expect(html).toContain("CoolGuy123");
    expect(html).toContain("https://example.com/avatar.jpg");
    expect(html).toContain("Steam Achievements");
    expect(html).toContain("This is WARDOGS");
    expect(html).toContain("https://example.com/icon.jpg");
  });

  it("renders a Playtime stat when the SteamProfile has a cached playtime", async () => {
    await seedPlayer("1", "Alice");
    await db.insert(steamProfiles).values({
      steamId: "1",
      personaName: "CoolGuy123",
      avatarUrl: "https://example.com/avatar.jpg",
      achievements: [],
      playtimeMinutes: 1500,
      status: "ok",
      fetchedAt: new Date(),
    });

    const html = await renderPage("1");

    expect(html).toContain("Playtime");
    expect(html).toContain("25h");
  });

  it("renders no Playtime stat when the SteamProfile has no cached playtime", async () => {
    await seedPlayer("1", "Alice");
    await db.insert(steamProfiles).values({
      steamId: "1",
      personaName: "CoolGuy123",
      avatarUrl: "https://example.com/avatar.jpg",
      achievements: [],
      status: "private",
      fetchedAt: new Date(),
    });

    const html = await renderPage("1");

    expect(html).not.toContain("Playtime");
  });

  it("renders identically to before this feature when no SteamProfile is cached", async () => {
    await seedPlayer("1", "Alice");

    const html = await renderPage("1");

    expect(html).not.toContain("Steam Achievements");
    expect(html).not.toContain("<img");
  });

  it("renders the avatar but no achievements section when the achievements fetch came back private", async () => {
    await seedPlayer("1", "Alice");
    await db.insert(steamProfiles).values({
      steamId: "1",
      personaName: "CoolGuy123",
      avatarUrl: "https://example.com/avatar.jpg",
      achievements: [],
      status: "private",
      fetchedAt: new Date(),
    });

    const html = await renderPage("1");

    expect(html).toContain("CoolGuy123");
    expect(html).toContain("https://example.com/avatar.jpg");
    expect(html).not.toContain("Steam Achievements");
  });
});
