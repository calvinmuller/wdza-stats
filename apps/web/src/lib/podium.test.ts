import {
  bannedPlayers,
  createDb,
  currentSeason,
  playerCareerStats,
  playerSeasonStats,
  seasons,
  servers,
  steamProfiles,
  type Database,
  type Season,
} from "@wdza-stats/db";
import { gt } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getPodium } from "./podium";

const db: Database = createDb(process.env.DATABASE_URL!);

// Season 1 comes from the migration; tests add Seasons above it.
let baseline: number;
let season: Season;

beforeAll(async () => {
  season = await currentSeason(db);
  baseline = season.number;
});

afterEach(async () => {
  await db.delete(playerSeasonStats);
  await db.delete(seasons).where(gt(seasons.number, baseline));
  await db.delete(playerCareerStats);
  await db.delete(servers);
  await db.delete(steamProfiles);
  await db.delete(bannedPlayers);
});

afterAll(async () => {
  await db.$client.end();
});

async function addServer(slug: string, enabled = true) {
  const [server] = await db
    .insert(servers)
    .values({ name: slug, slug, baseUrl: `http://${slug}.test:9100`, enabled })
    .returning();
  return server;
}

type Played = { steamId: string; name: string; xp: number; kills?: number; deaths?: number; won?: number; careerXp?: number };

/** One player's Season and Career rows on a Server, as the Worker would leave them. */
async function played(serverId: number, player: Played, seasonId = season.id) {
  await db
    .insert(playerCareerStats)
    .values({ serverId, steamId: player.steamId, displayName: player.name, xp: player.careerXp ?? player.xp })
    .onConflictDoNothing();
  await db.insert(playerSeasonStats).values({
    seasonId,
    serverId,
    steamId: player.steamId,
    xp: player.xp,
    kills: player.kills ?? 0,
    deaths: player.deaths ?? 0,
    matchesWon: player.won ?? 0,
    matchesPlayed: 1,
  });
}

describe("getPodium", () => {
  it("ranks players by their current-Season XP summed across every Server", async () => {
    const alpha = await addServer("alpha");
    const bravo = await addServer("bravo");
    // Bob leads on neither Server alone, but leads once both are summed.
    await played(alpha.id, { steamId: "1", name: "Alice", xp: 900, kills: 9, deaths: 3, won: 2 });
    await played(alpha.id, { steamId: "2", name: "Bob", xp: 600, kills: 6, deaths: 2, won: 1 });
    await played(bravo.id, { steamId: "2", name: "Bob", xp: 600, kills: 4, deaths: 3, won: 1 });
    await played(bravo.id, { steamId: "3", name: "Carol", xp: 300, kills: 3, deaths: 1 });
    await played(bravo.id, { steamId: "4", name: "Dave", xp: 100 });

    const podium = await getPodium(db);

    expect(podium.season.id).toBe(season.id);
    expect(podium.places.map((place) => [place.place, place.steamId, place.xp])).toEqual([
      [1, "2", 1200],
      [2, "1", 900],
      [3, "3", 300],
    ]);
    expect(podium.places[0]).toMatchObject({ displayName: "Bob", kills: 10, deaths: 5, kd: 2, matchesWon: 2 });
  });

  it("shows the overall level, from career XP summed across Servers", async () => {
    const alpha = await addServer("alpha");
    const bravo = await addServer("bravo");
    // 1,500 career XP on each Server is level 2 on either (the seeded curve
    // puts level 2 at 1,000 and level 3 at 2,500); 3,000 summed is level 3.
    await played(alpha.id, { steamId: "1", name: "Alice", xp: 100, careerXp: 1500 });
    await played(bravo.id, { steamId: "1", name: "Alice", xp: 100, careerXp: 1500 });

    const [place] = (await getPodium(db)).places;

    expect(place.level).toBe(3);
  });

  it("breaks an XP tie by Season kills", async () => {
    const alpha = await addServer("alpha");
    await played(alpha.id, { steamId: "1", name: "Alice", xp: 500, kills: 2 });
    await played(alpha.id, { steamId: "2", name: "Bob", xp: 500, kills: 7 });

    const podium = await getPodium(db);

    expect(podium.places.map((place) => place.steamId)).toEqual(["2", "1"]);
  });

  it("leaves out banned players, disabled Servers and other Seasons", async () => {
    const alpha = await addServer("alpha");
    const retired = await addServer("retired", false);
    const [next] = await db
      .insert(seasons)
      .values({ number: baseline + 1, startedAt: new Date() })
      .returning();
    await played(alpha.id, { steamId: "1", name: "Alice", xp: 100 }, next.id);
    await played(alpha.id, { steamId: "2", name: "Banned Bob", xp: 900 }, next.id);
    await played(retired.id, { steamId: "1", name: "Alice", xp: 5000 }, next.id);
    await played(alpha.id, { steamId: "3", name: "Last-Season Carol", xp: 900 }, season.id);
    await db.insert(bannedPlayers).values({ steamId: "2", reason: "cheating" });

    const podium = await getPodium(db);

    expect(podium.season.id).toBe(next.id);
    expect(podium.places.map((place) => [place.steamId, place.xp])).toEqual([["1", 100]]);
  });

  it("is empty until someone has played a Match this Season", async () => {
    const alpha = await addServer("alpha");
    // A kill in a still-open Match makes a row before any Match is played.
    await db.insert(playerCareerStats).values({ serverId: alpha.id, steamId: "1", displayName: "Alice" });
    await db.insert(playerSeasonStats).values({ seasonId: season.id, serverId: alpha.id, steamId: "1", kills: 3 });

    expect((await getPodium(db)).places).toEqual([]);
  });
});
