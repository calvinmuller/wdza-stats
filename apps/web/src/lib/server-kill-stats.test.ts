import {
  bannedPlayers,
  createDb,
  currentSeason,
  kills,
  matches,
  playerCareerStats,
  seasons,
  servers,
  type Database,
} from "@wdza-stats/db";
import { gt } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { KillScope } from "./kill-scope";
import { getLongestKills, getServerWeaponStats, getTopKillers, SERVER_WEAPONS_SIZE } from "./server-kill-stats";

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
  await db.delete(bannedPlayers);
  await db.delete(playerCareerStats);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

const ALICE = "76561198000000001";
const BOB = "76561198000000002";

const AK = "Id.Item.AK74M";
const SVD = "Id.Item.SVDM";
const ARTILLERY = "Id.Vehicle.WeaponExtension.TNK_01.Artillery";

const ALL_TIME: KillScope = { kind: "career" };

async function seedServer() {
  const [server] = await db.insert(servers).values({ name: "WDZA Test", baseUrl: "http://rcon.test" }).returning();
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

describe("getServerWeaponStats", () => {
  it("counts every player's Kills and headshots per weapon, most kills first", async () => {
    const server = await seedServer();
    await seedKill(server.id, { cause: SVD, headshot: true });
    await seedKill(server.id, { cause: AK, headshot: true });
    await seedKill(server.id, { cause: AK, killerSteamId: BOB, killerName: "Bob", victimSteamId: ALICE });
    await seedKill(server.id, { cause: "Vehicle.Variant.Land.Wheeled.Kodiak.Default", tags: ["RoadKill"] });

    expect(await getServerWeaponStats(db, server.id, ALL_TIME, [])).toEqual([
      { cause: AK, weapon: "AK74", kills: 2, headshots: 1 },
      { cause: SVD, weapon: "SVD", kills: 1, headshots: 1 },
      { cause: "Vehicle.Variant.Land.Wheeled.Kodiak.Default", weapon: "Kodiak", kills: 1, headshots: 0 },
    ]);
  });

  it("leaves out suicides, deaths by the environment, and banned killers", async () => {
    const server = await seedServer();
    await seedKill(server.id);
    await seedKill(server.id, { suicide: true, victimSteamId: ALICE });
    await seedKill(server.id, { killerSteamId: null, killerName: null, cause: "Falling" });
    await seedKill(server.id, { killerSteamId: BOB, killerName: "Bob", victimSteamId: ALICE });
    await db.insert(bannedPlayers).values({ steamId: BOB });

    expect(await getServerWeaponStats(db, server.id, ALL_TIME, [BOB])).toEqual([
      { cause: AK, weapon: "AK74", kills: 1, headshots: 0 },
    ]);
  });

  it("counts only the picked Season's Matches", async () => {
    const server = await seedServer();
    const [season] = await db.insert(seasons).values({ number: baseline + 1 }).returning();
    const [match] = await db
      .insert(matches)
      .values({ serverId: server.id, seasonId: season.id, map: "Kavkazi", experiences: [], startedAt: new Date() })
      .returning();
    await seedKill(server.id, { matchRow: match.id, cause: SVD });
    await seedKill(server.id, { cause: AK });

    expect(await getServerWeaponStats(db, server.id, { kind: "season", season }, [])).toEqual([
      { cause: SVD, weapon: "SVD", kills: 1, headshots: 0 },
    ]);
  });

  it(`returns only the top ${SERVER_WEAPONS_SIZE} weapons`, async () => {
    const server = await seedServer();
    for (let i = 0; i < SERVER_WEAPONS_SIZE + 2; i += 1) {
      await seedKill(server.id, { cause: `Id.Item.Gun${String(i).padStart(2, "0")}` });
    }

    expect(await getServerWeaponStats(db, server.id, ALL_TIME, [])).toHaveLength(SERVER_WEAPONS_SIZE);
  });
});

describe("getLongestKills", () => {
  it("lists the longest Kills first, rounded to the metre, skipping ones with no distance", async () => {
    const server = await seedServer();
    await seedKill(server.id, { distanceM: 120.4 });
    await seedKill(server.id, {
      cause: ARTILLERY,
      distanceM: 2577.2,
      receivedAt: new Date("2026-10-07T19:52:21.000Z"),
    });
    await seedKill(server.id, { distanceM: null });
    await seedKill(server.id, { suicide: true, victimSteamId: ALICE, distanceM: 5000 });

    const rows = await getLongestKills(db, server.id, ALL_TIME, []);

    expect(rows.map((row) => row.distanceM)).toEqual([2577, 120]);
    expect(rows[0]).toMatchObject({
      receivedAt: "2026-10-07T19:52:21.000Z",
      killerSteamId: ALICE,
      killerName: "Alice",
      victimSteamId: BOB,
      victimName: "Bob",
      weapon: "SPH-2 artillery",
    });
  });

  it("leaves out banned killers", async () => {
    const server = await seedServer();
    await seedKill(server.id, { distanceM: 100 });
    await seedKill(server.id, { killerSteamId: BOB, killerName: "Bob", victimSteamId: ALICE, distanceM: 900 });

    const rows = await getLongestKills(db, server.id, ALL_TIME, [BOB]);

    expect(rows.map((row) => row.killerName)).toEqual(["Alice"]);
  });
});

describe("getTopKillers", () => {
  const CARA = "76561198000000003";

  it("ranks players by Kills with their deaths, headshots, team kills and average distance", async () => {
    const server = await seedServer();
    const enemy = { killerFaction: "Lonestar", victimFaction: "Valkyra" };
    await seedKill(server.id, { ...enemy, headshot: true, distanceM: 100 });
    await seedKill(server.id, { ...enemy, distanceM: 51 });
    await seedKill(server.id, { killerFaction: "Lonestar", victimFaction: "Lonestar", victimSteamId: CARA, victimName: "Cara" });
    await seedKill(server.id, { killerSteamId: BOB, killerName: "Bob", victimSteamId: ALICE, victimName: "Alice", ...enemy });
    // Deaths count suicides and the environment too.
    await seedKill(server.id, { killerSteamId: null, killerName: null, victimSteamId: ALICE, cause: "Falling" });
    await seedKill(server.id, { killerSteamId: BOB, killerName: "Bob", victimSteamId: BOB, suicide: true });

    expect(await getTopKillers(db, server.id, ALL_TIME, [])).toEqual([
      { steamId: ALICE, displayName: "Alice", kills: 3, deaths: 2, headshots: 1, teamKills: 1, averageM: 76 },
      { steamId: BOB, displayName: "Bob", kills: 1, deaths: 3, headshots: 0, teamKills: 0, averageM: null },
    ]);
  });

  it("names a player by their PlayerCareerStat over the name on their Kills", async () => {
    const server = await seedServer();
    await seedKill(server.id, { killerName: "Old name" });
    await db.insert(playerCareerStats).values({ serverId: server.id, steamId: ALICE, displayName: "Alice" });

    const [row] = await getTopKillers(db, server.id, ALL_TIME, []);

    expect(row.displayName).toBe("Alice");
  });

  it("leaves out banned players and counts only the picked Season's Matches", async () => {
    const server = await seedServer();
    const [season] = await db.insert(seasons).values({ number: baseline + 1 }).returning();
    const [match] = await db
      .insert(matches)
      .values({ serverId: server.id, seasonId: season.id, map: "Kavkazi", experiences: [], startedAt: new Date() })
      .returning();
    await seedKill(server.id, { matchRow: match.id });
    await seedKill(server.id);
    await seedKill(server.id, { matchRow: match.id, killerSteamId: BOB, killerName: "Bob", victimSteamId: ALICE });

    const rows = await getTopKillers(db, server.id, { kind: "season", season }, [BOB]);

    expect(rows).toEqual([expect.objectContaining({ steamId: ALICE, kills: 1, deaths: 1 })]);
  });
});
