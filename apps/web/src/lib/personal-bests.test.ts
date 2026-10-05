import {
  createDb,
  currentSeason,
  matches,
  playerMatchStats,
  seasons,
  servers,
  type Database,
} from "@wdza-stats/db";
import { gt } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getPlayerPersonalBests } from "./personal-bests";

const db: Database = createDb(process.env.DATABASE_URL!);

// Season 1 comes from the migration; tests add Seasons above it.
let baseline: number;

beforeAll(async () => {
  baseline = (await currentSeason(db)).number;
});

afterEach(async () => {
  await db.delete(playerMatchStats);
  await db.delete(matches);
  await db.delete(seasons).where(gt(seasons.number, baseline));
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

const ALICE = "1";
const CAREER = { kind: "career" } as const;

async function seedServer(baseUrl = "http://rcon.test") {
  const [server] = await db.insert(servers).values({ name: "WDZA Test", baseUrl }).returning();
  return server;
}

let matchSeq = 0;

// One Match on the Server with Alice's stats in it; closed unless told otherwise.
async function seedMatch(
  serverId: number,
  stat: { kills?: number; deaths?: number; cash?: number; steamId?: string },
  { seasonId, closed = true }: { seasonId?: number; closed?: boolean } = {},
) {
  matchSeq += 1;
  const [match] = await db
    .insert(matches)
    .values({
      serverId,
      ...(seasonId === undefined ? {} : { seasonId }),
      map: `Map ${matchSeq}`,
      experiences: ["Kinetic Diplomacy"],
      startedAt: new Date("2026-09-23T15:00:00.000Z"),
      endedAt: closed ? new Date("2026-09-23T16:07:00.000Z") : null,
    })
    .returning();
  await db.insert(playerMatchStats).values({
    matchId: match.id,
    steamId: stat.steamId ?? ALICE,
    faction: "Lonestar",
    kills: stat.kills ?? 0,
    deaths: stat.deaths ?? 0,
    cash: stat.cash ?? 0,
  });
  return match;
}

describe("getPlayerPersonalBests", () => {
  it("has no bests for a player with no Matches", async () => {
    const server = await seedServer();

    expect(await getPlayerPersonalBests(db, server.id, ALICE, CAREER)).toEqual({
      mostKills: null,
      bestKd: null,
      mostCash: null,
    });
  });

  it("picks the Match with the most kills, the best K/D and the most cash", async () => {
    const server = await seedServer();
    const killsMatch = await seedMatch(server.id, { kills: 88, deaths: 20, cash: 1000 });
    const kdMatch = await seedMatch(server.id, { kills: 72, deaths: 6, cash: 500 });
    const cashMatch = await seedMatch(server.id, { kills: 10, deaths: 10, cash: 289_090 });

    const bests = await getPlayerPersonalBests(db, server.id, ALICE, CAREER);

    expect(bests.mostKills).toMatchObject({
      matchId: killsMatch.id,
      map: killsMatch.map,
      experiences: ["Kinetic Diplomacy"],
      endedAt: "2026-09-23T16:07:00.000Z",
      kills: 88,
    });
    expect(bests.bestKd).toMatchObject({ matchId: kdMatch.id, kills: 72, deaths: 6, kd: 12 });
    expect(bests.mostCash).toMatchObject({ matchId: cashMatch.id, cash: 289_090 });
  });

  it("counts a deathless Match's K/D as its kills", async () => {
    const server = await seedServer();
    await seedMatch(server.id, { kills: 10, deaths: 2 });
    const flawless = await seedMatch(server.id, { kills: 6, deaths: 0 });

    const { bestKd } = await getPlayerPersonalBests(db, server.id, ALICE, CAREER);

    expect(bestKd).toMatchObject({ matchId: flawless.id, kd: 6 });
  });

  it("gives a tied K/D to the Match with more kills", async () => {
    const server = await seedServer();
    await seedMatch(server.id, { kills: 5, deaths: 1 });
    const moreKills = await seedMatch(server.id, { kills: 10, deaths: 2 });

    const { bestKd } = await getPlayerPersonalBests(db, server.id, ALICE, CAREER);

    expect(bestKd).toMatchObject({ matchId: moreKills.id, kd: 5 });
  });

  it("has no best for a stat the player never scored", async () => {
    const server = await seedServer();
    await seedMatch(server.id, { kills: 0, deaths: 4, cash: 0 });

    expect(await getPlayerPersonalBests(db, server.id, ALICE, CAREER)).toEqual({
      mostKills: null,
      bestKd: null,
      mostCash: null,
    });
  });

  it("ignores other players, other Servers and still-open Matches", async () => {
    const server = await seedServer();
    const other = await seedServer("http://other.test");
    const counted = await seedMatch(server.id, { kills: 3 });
    await seedMatch(server.id, { kills: 50, steamId: "2" });
    await seedMatch(other.id, { kills: 50 });
    await seedMatch(server.id, { kills: 50 }, { closed: false });

    const { mostKills } = await getPlayerPersonalBests(db, server.id, ALICE, CAREER);

    expect(mostKills).toMatchObject({ matchId: counted.id, kills: 3 });
  });

  it("scopes to one Season's Matches", async () => {
    const server = await seedServer();
    const past = await currentSeason(db);
    const [current] = await db.insert(seasons).values({ number: baseline + 1 }).returning();
    await seedMatch(server.id, { kills: 40 }, { seasonId: past.id });
    const thisSeason = await seedMatch(server.id, { kills: 12 }, { seasonId: current.id });

    const inSeason = await getPlayerPersonalBests(db, server.id, ALICE, { kind: "season", season: current });
    const career = await getPlayerPersonalBests(db, server.id, ALICE, CAREER);

    expect(inSeason.mostKills).toMatchObject({ matchId: thisSeason.id, kills: 12 });
    expect(career.mostKills).toMatchObject({ kills: 40 });
  });
});
