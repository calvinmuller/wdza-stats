import {
  bannedPlayers,
  createDb,
  currentSeason,
  kills,
  matches,
  playerCareerStats,
  seasons,
  servers,
  steamProfiles,
  type Database,
} from "@wdza-stats/db";
import { gt } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getWeaponLeaderboard, listServerWeapons, mostUsedWeapon } from "./weapon-leaderboard";
import type { KillScope } from "./kill-scope";

const db: Database = createDb(process.env.DATABASE_URL!);

// Season 1 comes from the migration; tests add Seasons above it.
let baseline: number;

beforeAll(async () => {
  baseline = (await currentSeason(db)).number;
});

afterEach(async () => {
  await db.delete(kills);
  await db.delete(matches);
  await db.delete(seasons).where(gt(seasons.number, baseline));
  await db.delete(playerCareerStats);
  await db.delete(steamProfiles);
  await db.delete(bannedPlayers);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

const ALICE = "76561198000000001";
const BOB = "76561198000000002";
const CARA = "76561198000000003";

const AK = "Id.Item.AK74M";
const SVD = "Id.Item.SVDM";

const ALL_TIME: KillScope = { kind: "career" };
const WEEK: KillScope = { kind: "window", days: 7 };

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

async function seedServer(baseUrl = "http://rcon.test") {
  const [server] = await db.insert(servers).values({ name: "WDZA Test", baseUrl }).returning();
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
    cause: AK,
    tags: [],
    ...kill,
  });
}

const ranking = (board: Awaited<ReturnType<typeof getWeaponLeaderboard>>) =>
  board.rows.map(({ rank, displayName, kills, headshots }) => ({ rank, displayName, kills, headshots }));

describe("listServerWeapons", () => {
  it("lists every weapon with a counting Kill, alphabetically, with a slug", async () => {
    const server = await seedServer();
    await seedKill(server.id, { cause: SVD });
    await seedKill(server.id, { cause: AK });
    await seedKill(server.id, { cause: AK });
    await seedKill(server.id, { cause: "Id.Vehicle.WeaponExtension.WHL_05.RingMinigun" });

    expect(await listServerWeapons(db, server.id, [])).toEqual([
      { cause: AK, weapon: "AK74", slug: "ak74" },
      { cause: "Id.Vehicle.WeaponExtension.WHL_05.RingMinigun", weapon: "Humvee minigun", slug: "humvee-minigun" },
      { cause: SVD, weapon: "SVD", slug: "svd" },
    ]);
  });

  it("leaves out suicides, environment deaths, roadkills, and banned killers", async () => {
    const server = await seedServer();
    await seedKill(server.id, { cause: "Id.Item.M4", victimSteamId: ALICE, suicide: true });
    await seedKill(server.id, { cause: "Id.Item.SV98", killerSteamId: null, killerName: null, tags: ["Falling"] });
    await seedKill(server.id, { cause: "Id.Vehicle.WHL_05", tags: ["RoadKill"] });
    await seedKill(server.id, { cause: "Id.Vehicle.WHL_05", tags: ["VehicleExplosion"] });
    await seedKill(server.id, { cause: SVD, killerSteamId: CARA, killerName: "Cara" });
    await seedKill(server.id, { cause: AK });

    expect((await listServerWeapons(db, server.id, [CARA])).map((weapon) => weapon.cause)).toEqual([AK]);
  });
});

describe("getWeaponLeaderboard", () => {
  it("ranks killers by kills, then headshots, then name, with a summary", async () => {
    const server = await seedServer();
    await db.insert(playerCareerStats).values([
      { serverId: server.id, steamId: ALICE, displayName: "Alice" },
      { serverId: server.id, steamId: BOB, displayName: "Bob" },
      { serverId: server.id, steamId: CARA, displayName: "Cara" },
    ]);
    await db.insert(steamProfiles).values({
      steamId: BOB,
      personaName: "Bob",
      avatarUrl: "https://a/bob.jpg",
      countryCode: "ZA",
      achievements: [],
      status: "ok",
      fetchedAt: new Date(),
    });
    // Alice: 1 kill. Bob: 2 kills, 1 headshot. Cara: 2 kills, 2 headshots.
    await seedKill(server.id, { killerSteamId: ALICE, victimSteamId: BOB });
    await seedKill(server.id, { killerSteamId: BOB, killerName: "Bob", victimSteamId: ALICE, headshot: true });
    await seedKill(server.id, { killerSteamId: BOB, killerName: "Bob", victimSteamId: CARA });
    await seedKill(server.id, { killerSteamId: CARA, killerName: "Cara", victimSteamId: ALICE, headshot: true });
    await seedKill(server.id, { killerSteamId: CARA, killerName: "Cara", victimSteamId: BOB, headshot: true });
    // Another weapon never counts.
    await seedKill(server.id, { killerSteamId: ALICE, cause: SVD });

    const board = await getWeaponLeaderboard(db, server.id, AK, ALL_TIME, []);

    expect(board.totalKills).toBe(5);
    expect(board.playerCount).toBe(3);
    expect(ranking(board)).toEqual([
      { rank: 1, displayName: "Cara", kills: 2, headshots: 2 },
      { rank: 2, displayName: "Bob", kills: 2, headshots: 1 },
      { rank: 3, displayName: "Alice", kills: 1, headshots: 0 },
    ]);
    expect(board.rows[1]).toMatchObject({ steamId: BOB, avatarUrl: "https://a/bob.jpg", countryCode: "ZA" });
    expect(board.rows[0]).toMatchObject({ avatarUrl: null, countryCode: null });
  });

  it("names a killer with no career row by their latest Kill", async () => {
    const server = await seedServer();
    await seedKill(server.id, { killerName: "Alice" });
    await seedKill(server.id, { killerName: "Alice (renamed)" });

    const board = await getWeaponLeaderboard(db, server.id, AK, ALL_TIME, []);

    expect(board.rows[0].displayName).toBe("Alice (renamed)");
  });

  it("hides banned killers and does not count suicides or roadkills", async () => {
    const server = await seedServer();
    await seedKill(server.id, { killerSteamId: BOB, killerName: "Bob", victimSteamId: ALICE });
    await seedKill(server.id);
    await seedKill(server.id, { victimSteamId: ALICE, suicide: true });
    await seedKill(server.id, { tags: ["RoadKill"] });

    const board = await getWeaponLeaderboard(db, server.id, AK, ALL_TIME, [BOB]);

    expect(board.totalKills).toBe(1);
    expect(ranking(board)).toEqual([{ rank: 1, displayName: "Alice", kills: 1, headshots: 0 }]);
  });

  it("counts only Kills delivered inside a Window", async () => {
    const server = await seedServer();
    await seedKill(server.id, { receivedAt: daysAgo(8) });
    await seedKill(server.id, { receivedAt: daysAgo(6) });
    // A Kill with no Match open still counts in a Window.
    await seedKill(server.id, { receivedAt: daysAgo(1), matchRow: null });
    await seedKill(server.id, { killerSteamId: BOB, killerName: "Bob", victimSteamId: ALICE, receivedAt: daysAgo(20) });

    const week = await getWeaponLeaderboard(db, server.id, AK, WEEK, []);
    const month = await getWeaponLeaderboard(db, server.id, AK, { kind: "window", days: 30 }, []);

    expect(ranking(week)).toEqual([{ rank: 1, displayName: "Alice", kills: 2, headshots: 0 }]);
    expect(ranking(month)).toEqual([
      { rank: 1, displayName: "Alice", kills: 3, headshots: 0 },
      { rank: 2, displayName: "Bob", kills: 1, headshots: 0 },
    ]);
  });

  it("counts only the Kills of a Season's Matches in a Season scope", async () => {
    const server = await seedServer();
    const past = await currentSeason(db);
    const [current] = await db.insert(seasons).values({ number: baseline + 1 }).returning();
    const match = async (seasonId: number) =>
      (
        await db
          .insert(matches)
          .values({
            serverId: server.id,
            seasonId,
            map: "Kavkazi",
            experiences: ["Frontline"],
            startedAt: new Date("2026-01-01T00:00:00.000Z"),
          })
          .returning()
      )[0];
    const pastMatch = await match(past.id);
    const currentMatch = await match(current.id);
    await seedKill(server.id, { matchRow: pastMatch.id });
    await seedKill(server.id, { matchRow: currentMatch.id });
    await seedKill(server.id, { matchRow: currentMatch.id });
    // No Match was open: counts only towards all time and Windows.
    await seedKill(server.id, { matchRow: null });

    const season = await getWeaponLeaderboard(db, server.id, AK, { kind: "season", season: current }, []);
    const allTime = await getWeaponLeaderboard(db, server.id, AK, ALL_TIME, []);

    expect(season.totalKills).toBe(2);
    expect(allTime.totalKills).toBe(4);
  });

  it("counts only Kills on the given Server", async () => {
    const server = await seedServer();
    const other = await seedServer("http://other.test");
    await seedKill(server.id);
    await seedKill(other.id);

    expect((await getWeaponLeaderboard(db, server.id, AK, ALL_TIME, [])).totalKills).toBe(1);
  });
});

describe("mostUsedWeapon", () => {
  it("is the weapon with the most counting Kills in the scope, or null", async () => {
    const server = await seedServer();
    await seedKill(server.id, { cause: SVD, receivedAt: daysAgo(10) });
    await seedKill(server.id, { cause: SVD, receivedAt: daysAgo(10) });
    await seedKill(server.id, { cause: AK, receivedAt: daysAgo(1) });

    expect(await mostUsedWeapon(db, server.id, ALL_TIME, [])).toBe(SVD);
    expect(await mostUsedWeapon(db, server.id, WEEK, [])).toBe(AK);
    expect(await mostUsedWeapon(db, server.id, WEEK, [ALICE])).toBeNull();
  });
});
