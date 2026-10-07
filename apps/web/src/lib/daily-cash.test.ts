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
import { getPlayerDailyCash } from "./daily-cash";

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

// One Match on the Server ending at `endedAt` (null leaves it open), with Alice's cash in it.
async function seedMatch(
  serverId: number,
  endedAt: string | null,
  cash: number,
  { steamId = ALICE, seasonId }: { steamId?: string; seasonId?: number } = {},
) {
  const [match] = await db
    .insert(matches)
    .values({
      serverId,
      ...(seasonId === undefined ? {} : { seasonId }),
      map: "Bakurani",
      experiences: ["Kinetic Diplomacy"],
      startedAt: new Date("2026-09-01T00:00:00.000Z"),
      endedAt: endedAt === null ? null : new Date(endedAt),
    })
    .returning();
  await db.insert(playerMatchStats).values({
    matchId: match.id,
    steamId,
    faction: "Lonestar",
    kills: 0,
    deaths: 0,
    cash,
  });
  return match;
}

describe("getPlayerDailyCash", () => {
  it("has no days for a player with no Matches", async () => {
    const server = await seedServer();

    expect(await getPlayerDailyCash(db, server.id, ALICE, CAREER)).toEqual([]);
  });

  it("sums each UTC day's cash across its Matches, newest day first", async () => {
    const server = await seedServer();
    await seedMatch(server.id, "2026-09-23T10:00:00.000Z", 1000);
    await seedMatch(server.id, "2026-09-23T23:59:00.000Z", 2500);
    await seedMatch(server.id, "2026-09-24T00:01:00.000Z", 400);
    await seedMatch(server.id, "2026-09-20T12:00:00.000Z", 7000);

    expect(await getPlayerDailyCash(db, server.id, ALICE, CAREER)).toEqual([
      { day: "2026-09-24", cash: 400, matches: 1 },
      { day: "2026-09-23", cash: 3500, matches: 2 },
      { day: "2026-09-20", cash: 7000, matches: 1 },
    ]);
  });

  it("keeps only the 14 most recent days played", async () => {
    const server = await seedServer();
    for (let day = 1; day <= 16; day++) {
      await seedMatch(server.id, `2026-09-${String(day).padStart(2, "0")}T12:00:00.000Z`, day);
    }

    const days = await getPlayerDailyCash(db, server.id, ALICE, CAREER);

    expect(days).toHaveLength(14);
    expect(days[0].day).toBe("2026-09-16");
    expect(days[13].day).toBe("2026-09-03");
  });

  it("ignores other players, other Servers and still-open Matches", async () => {
    const server = await seedServer();
    const other = await seedServer("http://other.test");
    await seedMatch(server.id, "2026-09-23T10:00:00.000Z", 300);
    await seedMatch(server.id, "2026-09-23T11:00:00.000Z", 5000, { steamId: "2" });
    await seedMatch(other.id, "2026-09-23T12:00:00.000Z", 5000);
    await seedMatch(server.id, null, 5000);

    expect(await getPlayerDailyCash(db, server.id, ALICE, CAREER)).toEqual([
      { day: "2026-09-23", cash: 300, matches: 1 },
    ]);
  });

  it("scopes to one Season's Matches", async () => {
    const server = await seedServer();
    const past = await currentSeason(db);
    const [current] = await db.insert(seasons).values({ number: baseline + 1 }).returning();
    await seedMatch(server.id, "2026-09-23T10:00:00.000Z", 900, { seasonId: past.id });
    await seedMatch(server.id, "2026-09-23T20:00:00.000Z", 100, { seasonId: current.id });

    const inSeason = await getPlayerDailyCash(db, server.id, ALICE, { kind: "season", season: current });
    const career = await getPlayerDailyCash(db, server.id, ALICE, CAREER);

    expect(inSeason).toEqual([{ day: "2026-09-23", cash: 100, matches: 1 }]);
    expect(career).toEqual([{ day: "2026-09-23", cash: 1000, matches: 2 }]);
  });
});
