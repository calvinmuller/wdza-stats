import { createDb, currentSeason, kills, matches, seasons, servers, type Database } from "@wdza-stats/db";
import { gt } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getPlayerWeaponStats } from "./weapon-stats";

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
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

const ALICE = "76561198000000001";
const BOB = "76561198000000002";

async function seedServer(baseUrl = "http://rcon.test") {
  const [server] = await db.insert(servers).values({ name: "WDZA Test", baseUrl }).returning();
  return server;
}

let eventSeq = 0;

async function seedKill(
  serverId: number,
  kill: Partial<typeof kills.$inferInsert> = {},
) {
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

describe("getPlayerWeaponStats", () => {
  it("returns nothing for a player with no Kills", async () => {
    const server = await seedServer();

    expect(await getPlayerWeaponStats(db, server.id, ALICE, { kind: "career" })).toEqual([]);
  });

  it("totals a player's Kills per weapon, most kills first", async () => {
    const server = await seedServer();
    await seedKill(server.id, { cause: "Id.Item.SV98", distanceM: 300, headshot: true });
    await seedKill(server.id, { cause: "Id.Item.AK74M", distanceM: 20, headshot: true });
    await seedKill(server.id, { cause: "Id.Item.AK74M", distanceM: 40 });
    await seedKill(server.id, { cause: "Id.Item.AK74M", distanceM: null });

    const stats = await getPlayerWeaponStats(db, server.id, ALICE, { kind: "career" });

    expect(stats).toEqual([
      { cause: "Id.Item.AK74M", weapon: "AK74", kills: 3, headshots: 1, longestM: 40, averageM: 30 },
      { cause: "Id.Item.SV98", weapon: "SV98", kills: 1, headshots: 1, longestM: 300, averageM: 300 },
    ]);
  });

  it("gives no distances for a weapon the game never reported one for", async () => {
    const server = await seedServer();
    await seedKill(server.id, { cause: "Id.Item.C4Explosive", distanceM: null });

    const [stat] = await getPlayerWeaponStats(db, server.id, ALICE, { kind: "career" });

    expect(stat).toMatchObject({ weapon: "C4 charge", longestM: null, averageM: null });
  });

  it("counts only Kills the player made, not deaths, suicides or causeless kills", async () => {
    const server = await seedServer();
    await seedKill(server.id);
    // Bob killing Alice is Bob's Kill.
    await seedKill(server.id, { killerSteamId: BOB, victimSteamId: ALICE });
    // A suicide names the player as both.
    await seedKill(server.id, { victimSteamId: ALICE, suicide: true });
    await seedKill(server.id, { cause: null });

    const stats = await getPlayerWeaponStats(db, server.id, ALICE, { kind: "career" });

    expect(stats.map(({ weapon, kills }) => ({ weapon, kills }))).toEqual([
      { weapon: "AK74", kills: 1 },
    ]);
  });

  it("counts only Kills on the given Server", async () => {
    const server = await seedServer();
    const other = await seedServer("http://other.test");
    await seedKill(server.id);
    await seedKill(other.id);

    const stats = await getPlayerWeaponStats(db, server.id, ALICE, { kind: "career" });

    expect(stats[0].kills).toBe(1);
  });

  it("scopes to the Season of the Match each Kill arrived in", async () => {
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

    await seedKill(server.id, { matchRow: pastMatch.id, cause: "Id.Item.SV98" });
    await seedKill(server.id, { matchRow: currentMatch.id, cause: "Id.Item.AK74M" });
    // No Match was open: counts only towards Career.
    await seedKill(server.id, { matchRow: null, cause: "Id.Item.M4" });

    const weapons = async (scope: Parameters<typeof getPlayerWeaponStats>[3]) =>
      (await getPlayerWeaponStats(db, server.id, ALICE, scope)).map((stat) => stat.weapon).sort();

    expect(await weapons({ kind: "season", season: past })).toEqual(["SV98"]);
    expect(await weapons({ kind: "season", season: current })).toEqual(["AK74"]);
    expect(await weapons({ kind: "career" })).toEqual(["AK74", "M4", "SV98"]);
  });
});
