import {
  challengeCompletions,
  challengeDefinitions,
  challengeInstances,
  createDb,
  currentSeason,
  dailyPeriodKey,
  kills,
  matches,
  playerAchievements,
  playerCareerStats,
  playerChallengeProgress,
  playerMatchStats,
  playerSeasonStats,
  seasons,
  servers,
  steamAchievementSchema,
  steamProfiles,
  verifiedPlayers,
  WARDOGS_STEAM_APP_ID,
  type Database,
} from "@wdza-stats/db";
import { gt, inArray } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import PlayerPage from "./page";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = process.env.RCON_BASE_URL!;

const NOT_FOUND = /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/;

const insertedDefinitionIds: number[] = [];

// Season 1 comes from the migration; tests add Seasons above it.
let baseline: number;

beforeAll(async () => {
  baseline = (await currentSeason(db)).number;
});

afterEach(async () => {
  await db.delete(playerSeasonStats);
  await db.delete(seasons).where(gt(seasons.number, baseline));
  await db.delete(challengeCompletions);
  await db.delete(playerChallengeProgress);
  await db.delete(challengeInstances);
  if (insertedDefinitionIds.length > 0) {
    await db.delete(challengeDefinitions).where(inArray(challengeDefinitions.id, insertedDefinitionIds));
    insertedDefinitionIds.length = 0;
  }
  await db.delete(playerAchievements);
  await db.delete(playerCareerStats);
  await db.delete(kills);
  await db.delete(playerMatchStats);
  await db.delete(matches);
  await db.delete(servers);
  await db.delete(steamProfiles);
  await db.delete(steamAchievementSchema);
  await db.delete(verifiedPlayers);
});

afterAll(async () => {
  await db.$client.end();
});

// Most tests here seed only PlayerCareerStat rows, so they view Career; the
// Seasons tests pass their own `season`.
async function renderPage(steamId: string, searchParams: { season?: string } = { season: "career" }) {
  const element = await PlayerPage({
    params: Promise.resolve({ steamId }),
    searchParams: Promise.resolve(searchParams),
  });
  return renderToStaticMarkup(element);
}

// One stat tile, e.g. tile("Kills", 30), as the page renders it.
const tile = (label: string, value: string | number) =>
  new RegExp(`>${label}</dt><dd[^>]*>${value}</dd>`);

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

describe("PlayerPage weapons", () => {
  async function seedKills(causes: string[]) {
    const [server] = await db.select().from(servers).limit(1);
    await db.insert(kills).values(
      causes.map((cause, n) => ({
        serverId: server.id,
        eventId: `event-${n}`,
        instanceId: "boot",
        gameMatchId: "game-match",
        eventTime: n,
        map: "Kavkazi",
        killerSteamId: "1",
        killerName: "Alice",
        victimSteamId: "2",
        victimName: "Bob",
        cause,
        headshot: n === 0,
        distanceM: 50,
        tags: [],
      })),
    );
  }

  it("shows the player's top three weapons and every weapon in a collapsed list", async () => {
    await seedPlayer("1", "Alice");
    await seedKills([
      "Id.Item.AK74M",
      "Id.Item.AK74M",
      "Id.Item.AK74M",
      "Id.Item.AK74M",
      "Id.Item.SV98",
      "Id.Item.SV98",
      "Id.Item.SV98",
      "Id.Item.M4",
      "Id.Item.M4",
      "Id.Item.Glock17",
    ]);

    const html = await renderPage("1");

    const top = html.slice(html.indexOf("Top weapons"), html.indexOf("<details"));
    expect(top).toMatch(/AK74.*4 kills, 1 headshot<.*SV98.*3 kills, 0 headshots.*M4.*2 kills/s);
    expect(top).not.toContain("GGX 17");
    expect(html).toContain("Show all 4 weapons");
    expect(html.slice(html.indexOf("<details"))).toContain("GGX 17");
  });

  it("says so when the kill feed has no Kills for the player", async () => {
    await seedPlayer("1", "Alice");

    const html = await renderPage("1");

    expect(html).toContain("No kills recorded by the kill feed yet.");
    expect(html).not.toContain("<details");
  });
});

describe("PlayerPage personal bests", () => {
  it("shows the player's best Match for kills, K/D and cash, linking to each", async () => {
    await seedPlayer("1", "Alice");
    const [server] = await db.select().from(servers).limit(1);
    const match = async (kills: number, deaths: number, cash: number) => {
      const [row] = await db
        .insert(matches)
        .values({
          serverId: server.id,
          map: "Bakurani",
          experiences: ["Kinetic Diplomacy"],
          startedAt: new Date("2026-09-23T15:00:00.000Z"),
          endedAt: new Date("2026-09-23T16:07:00.000Z"),
        })
        .returning();
      await db
        .insert(playerMatchStats)
        .values({ matchId: row.id, steamId: "1", faction: "Lonestar", kills, deaths, cash });
      return row;
    };
    const killsMatch = await match(88, 20, 1000);
    await match(72, 6, 500);
    await match(10, 10, 289_090);

    const html = await renderPage("1");

    expect(html).toContain("88 kills");
    expect(html).toContain("K/D 12.00 (72 to 6)");
    expect(html).toContain("289,090 cash");
    expect(html).toContain(`href="/matches/${killsMatch.id}"`);
    expect(html).toContain("Bakurani on Kinetic Diplomacy, ");
  });

  it("says so when the player has no completed Matches", async () => {
    await seedPlayer("1", "Alice");

    const html = await renderPage("1");

    const panel = html.slice(html.indexOf("Personal bests"), html.indexOf("Top weapons"));
    expect(panel).toContain("No completed matches yet.");
  });
});

describe("PlayerPage cash per day", () => {
  it("shows the cash the player earned on each day they played", async () => {
    await seedPlayer("1", "Alice");
    const [server] = await db.select().from(servers).limit(1);
    for (const [endedAt, cash] of [
      ["2026-09-23T10:00:00.000Z", 1000],
      ["2026-09-23T18:00:00.000Z", 2500],
      ["2026-09-24T09:00:00.000Z", 400],
    ] as const) {
      const [row] = await db
        .insert(matches)
        .values({
          serverId: server.id,
          map: "Bakurani",
          experiences: ["Kinetic Diplomacy"],
          startedAt: new Date("2026-09-23T00:00:00.000Z"),
          endedAt: new Date(endedAt),
        })
        .returning();
      await db
        .insert(playerMatchStats)
        .values({ matchId: row.id, steamId: "1", faction: "Lonestar", kills: 0, deaths: 0, cash });
    }

    const html = await renderPage("1");

    const panel = html.slice(html.indexOf("Cash per day"));
    expect(panel).toContain("Thu, 24 Sept 2026");
    expect(panel).toContain("400 cash");
    expect(panel).toContain("Wed, 23 Sept 2026");
    expect(panel).toContain("3,500 cash");
    expect(panel).toContain("2 matches");
  });

  it("says so when the player has no completed Matches", async () => {
    await seedPlayer("1", "Alice");

    const html = await renderPage("1");

    expect(html.slice(html.indexOf("Cash per day"))).toContain("No completed matches yet.");
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

describe("PlayerPage gamification", () => {
  it("renders level, XP, unlocked Achievements, and today's challenge progress for a seeded player", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();
    await db.insert(playerCareerStats).values({
      serverId: server.id,
      steamId: "1",
      displayName: "Alice",
      xp: 1300,
      matchesWon: 6,
      matchesLost: 4,
      highestKillStreak: 12,
      mvpCount: 2,
    });
    await db.insert(playerAchievements).values({
      serverId: server.id,
      steamId: "1",
      achievementId: "first_blood",
    });
    const [definition] = await db
      .insert(challengeDefinitions)
      .values({ type: "kills", scope: "daily", target: 20, xpReward: 150 })
      .returning();
    insertedDefinitionIds.push(definition.id);
    const [instance] = await db
      .insert(challengeInstances)
      .values({ definitionId: definition.id, serverId: server.id, periodKey: dailyPeriodKey(new Date()) })
      .returning();
    await db.insert(playerChallengeProgress).values({ instanceId: instance.id, steamId: "1", progress: 8 });

    const html = await renderPage("1");

    expect(html).toContain("Level 2");
    expect(html).toContain("1,300 XP total");
    expect(html).toContain("First Blood");
    expect(html).toContain("Get 20 kills");
    expect(html).toContain("8 / 20");
    expect(html).toContain("Matches won");
    expect(html).toContain("Highest kill streak");
    expect(html).toContain("MVP count");
  });

  it("renders sensible defaults for a player with no gamification activity yet", async () => {
    await seedPlayer("1", "Alice");

    const html = await renderPage("1");

    expect(html).toContain("Level 1");
    expect(html).toContain("0 XP total");
    expect(html).toContain("No achievements unlocked yet.");
    expect(html).toContain("No active challenges right now.");
    expect(html).toContain("Nothing noteworthy has happened yet.");
  });
});

describe("PlayerPage verified badge", () => {
  it("shows a Verified badge once the steamId has been claimed", async () => {
    await seedPlayer("1", "Alice");
    await db.insert(verifiedPlayers).values({ steamId: "1" });

    const html = await renderPage("1");

    expect(html).toContain(">Verified<");
  });

  it("shows no badge for an unclaimed steamId", async () => {
    await seedPlayer("1", "Alice");

    const html = await renderPage("1");

    expect(html).not.toContain(">Verified<");
  });
});

describe("PlayerPage Seasons", () => {
  // Alice played only in the earlier Season.
  async function seedSeasonOnePlayer() {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();
    const past = await currentSeason(db);
    const [current] = await db.insert(seasons).values({ number: baseline + 1, name: "Dust Storm" }).returning();
    await db.insert(playerCareerStats).values({
      serverId: server.id,
      steamId: "1",
      displayName: "Alice",
      xp: 1300,
      kills: 40,
      deaths: 8,
      matchesPlayed: 5,
    });
    await db.insert(playerSeasonStats).values({
      seasonId: past.id,
      serverId: server.id,
      steamId: "1",
      xp: 900,
      kills: 25,
      deaths: 5,
      matchesPlayed: 3,
    });
    await db.insert(playerAchievements).values({ serverId: server.id, steamId: "1", achievementId: "first_blood" });
    return { past, current };
  }

  it("shows the empty state for a Season the player didn't play, and full tiles for one they did and for Career", async () => {
    const { past, current } = await seedSeasonOnePlayer();

    const thisSeason = await renderPage("1", {});
    expect(thisSeason).toContain(`No matches yet in Season ${current.number}`);
    expect(thisSeason).toContain('href="/players/1?season=career"');
    expect(thisSeason).not.toMatch(tile("Kills", "\\d+"));

    const lastSeason = await renderPage("1", { season: String(past.number) });
    expect(lastSeason).not.toContain("No matches yet");
    expect(lastSeason).toMatch(tile("Kills", 25));
    expect(lastSeason).toMatch(tile("K/D", "5.00"));
    expect(lastSeason).toMatch(tile("Matches played", 3));

    const career = await renderPage("1", { season: "career" });
    expect(career).toMatch(tile("Kills", 40));
    expect(career).toMatch(tile("Matches played", 5));
  });

  it("keeps level, XP, and Achievements career-long whatever the Season", async () => {
    const { past } = await seedSeasonOnePlayer();

    for (const season of [undefined, String(past.number), "career"]) {
      const html = await renderPage("1", { season });
      expect(html).toContain("Level 2");
      expect(html).toContain("1,300 XP total");
      expect(html).toContain("First Blood");
    }
  });

  it("offers the current Season, past Seasons, and Career as links to this player", async () => {
    const { past, current } = await seedSeasonOnePlayer();

    const html = await renderPage("1", {});

    expect(html).toContain(`href="/players/1?season=${current.number}"`);
    expect(html).toContain(`href="/players/1?season=${past.number}"`);
    expect(html).toContain('href="/players/1?season=career"');
    expect(html).toContain(`Season ${current.number} · Dust Storm`);
  });

  it("labels playtime as all-time in a Season view", async () => {
    const { past } = await seedSeasonOnePlayer();
    await db.insert(steamProfiles).values({
      steamId: "1",
      personaName: null,
      avatarUrl: null,
      achievements: [],
      playtimeMinutes: 120,
      status: "ok",
      fetchedAt: new Date(),
    });

    expect(await renderPage("1", { season: String(past.number) })).toMatch(tile("Playtime \\(all-time\\)", "2h"));
    expect(await renderPage("1", { season: "career" })).toMatch(tile("Playtime", "2h"));
  });

  it("is not found for a Season that doesn't exist", async () => {
    await seedSeasonOnePlayer();

    await expect(renderPage("1", { season: String(baseline + 5) })).rejects.toThrow(NOT_FOUND);
  });
});
