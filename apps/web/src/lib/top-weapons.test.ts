import {
  bannedPlayers,
  createDb,
  currentSeason,
  kills,
  matches,
  seasons,
  servers,
  type Database,
  type Season,
} from "@wdza-stats/db";
import { gt } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getTopWeapons, TOP_WEAPONS_SIZE } from "./top-weapons";

const db: Database = createDb(process.env.DATABASE_URL!);

// Season 1 comes from the migration; tests add Seasons above it.
let baseline: number;
let season: Season;

beforeAll(async () => {
  season = await currentSeason(db);
  baseline = season.number;
});

afterEach(async () => {
  await db.delete(kills);
  await db.delete(matches);
  await db.delete(seasons).where(gt(seasons.number, baseline));
  await db.delete(bannedPlayers);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

const ALICE = "76561198000000001";
const BOB = "76561198000000002";

const AK = "Id.Item.AK74M";
const SVD = "Id.Item.SVDM";

async function seedServer(slug: string, enabled = true) {
  const [server] = await db
    .insert(servers)
    .values({ name: slug, slug, baseUrl: `http://${slug}.test:9102`, enabled })
    .returning();
  const [match] = await db
    .insert(matches)
    .values({ serverId: server.id, seasonId: season.id, map: "Kavkazi", experiences: [], startedAt: new Date() })
    .returning();
  return { server, match };
}

let eventSeq = 0;

async function seedKill(at: Awaited<ReturnType<typeof seedServer>>, kill: Partial<typeof kills.$inferInsert> = {}) {
  eventSeq += 1;
  await db.insert(kills).values({
    serverId: at.server.id,
    matchRow: at.match.id,
    eventId: `top-weapons-${eventSeq}`,
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

const SEASON = () => ({ kind: "season", season }) as const;

describe("getTopWeapons", () => {
  it("ranks weapons by Kills summed across every enabled Server, most first", async () => {
    const alpha = await seedServer("alpha");
    const bravo = await seedServer("bravo");
    const retired = await seedServer("retired", false);
    // SVD leads on alpha, but the AK leads once bravo is added.
    await seedKill(alpha, { cause: SVD, headshot: true });
    await seedKill(alpha, { cause: SVD });
    await seedKill(alpha, { cause: AK });
    await seedKill(bravo, { cause: AK, headshot: true });
    await seedKill(bravo, { cause: AK });
    for (let i = 0; i < 5; i += 1) await seedKill(retired, { cause: SVD });

    expect(await getTopWeapons(db, SEASON())).toEqual([
      { cause: AK, weapon: "AK74", kills: 3, headshots: 1 },
      { cause: SVD, weapon: "SVD", kills: 2, headshots: 1 },
    ]);
  });

  it("leaves out suicides, roadkills, banned killers and other Seasons' Kills", async () => {
    const alpha = await seedServer("alpha");
    await seedKill(alpha, { cause: "Id.Item.SV98" });
    const [next] = await db.insert(seasons).values({ number: baseline + 1 }).returning();
    const [match] = await db
      .insert(matches)
      .values({ serverId: alpha.server.id, seasonId: next.id, map: "Kavkazi", experiences: [], startedAt: new Date() })
      .returning();
    const nextSeason = { ...alpha, match };
    await seedKill(nextSeason, { cause: "Id.Item.M4", victimSteamId: ALICE, suicide: true });
    await seedKill(nextSeason, { cause: "Id.Vehicle.WHL_05", tags: ["RoadKill"] });
    await seedKill(nextSeason, { cause: SVD, killerSteamId: BOB, killerName: "Bob", victimSteamId: ALICE });
    await seedKill(nextSeason, { cause: AK });
    await db.insert(bannedPlayers).values({ steamId: BOB });

    const top = await getTopWeapons(db, { kind: "season", season: next });

    expect(top.map((weapon) => weapon.cause)).toEqual([AK]);
  });

  it(`keeps only the top ${TOP_WEAPONS_SIZE}`, async () => {
    const alpha = await seedServer("alpha");
    const causes = ["Id.Item.A1", "Id.Item.A2", "Id.Item.A3", "Id.Item.A4", "Id.Item.A5", "Id.Item.A6"];
    for (const cause of causes) await seedKill(alpha, { cause });

    expect(await getTopWeapons(db, SEASON())).toHaveLength(TOP_WEAPONS_SIZE);
  });
});
