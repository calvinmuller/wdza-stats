import {
  challengeCompletions,
  challengeDefinitions,
  challengeInstances,
  createDb,
  playerAchievements,
  playerCareerStats,
  playerChallengeProgress,
  servers,
  type Database,
} from "@wdza-stats/db";
import { inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  getPlayerAchievements,
  getPlayerChallengeProgress,
  getPlayerProgression,
  getPlayerStats,
} from "./player-progression";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = "http://rcon.test:9006";

const insertedDefinitionIds: number[] = [];

async function insertChallengeDefinition(values: {
  type: "kills" | "wins" | "matches_played" | "kill_streak" | "kills_in_match" | "kills_without_dying";
  target: number;
  xpReward: number;
}) {
  const [row] = await db
    .insert(challengeDefinitions)
    .values({ scope: "daily", ...values })
    .returning();
  insertedDefinitionIds.push(row.id);
  return row;
}

afterEach(async () => {
  await db.delete(challengeCompletions);
  await db.delete(playerChallengeProgress);
  await db.delete(challengeInstances);
  if (insertedDefinitionIds.length > 0) {
    await db.delete(challengeDefinitions).where(inArray(challengeDefinitions.id, insertedDefinitionIds));
    insertedDefinitionIds.length = 0;
  }
  await db.delete(playerAchievements);
  await db.delete(playerCareerStats);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

async function seedServer() {
  const [server] = await db
    .insert(servers)
    .values({ name: "WDZA Test", baseUrl: BASE_URL })
    .returning();
  return server;
}

describe("getPlayerProgression", () => {
  it("returns null when the Server isn't seeded", async () => {
    const result = await getPlayerProgression(db, BASE_URL, "1");
    expect(result).toBeNull();
  });

  it("returns null when the player has no PlayerCareerStat row", async () => {
    await seedServer();

    const result = await getPlayerProgression(db, BASE_URL, "unknown");

    expect(result).toBeNull();
  });

  it("returns identity plus derived level/xp/progress for a seeded player", async () => {
    const server = await seedServer();
    await db.insert(playerCareerStats).values({
      serverId: server.id,
      steamId: "1",
      displayName: "Alice",
      xp: 1300,
      level: 2,
    });

    const result = await getPlayerProgression(db, BASE_URL, "1");

    expect(result).toEqual({
      steamId: "1",
      displayName: "Alice",
      personaName: null,
      avatarUrl: null,
      factionColor: null,
      level: 2,
      xp: 1300,
      xpIntoLevel: 300,
      xpRequiredForNextLevel: 1500,
      progressPercent: 20,
    });
  });

  it("renders sensible defaults for a player with no gamification activity yet", async () => {
    const server = await seedServer();
    await db.insert(playerCareerStats).values({
      serverId: server.id,
      steamId: "1",
      displayName: "Alice",
    });

    const result = await getPlayerProgression(db, BASE_URL, "1");

    expect(result).toEqual({
      steamId: "1",
      displayName: "Alice",
      personaName: null,
      avatarUrl: null,
      factionColor: null,
      level: 1,
      xp: 0,
      xpIntoLevel: 0,
      xpRequiredForNextLevel: 1000,
      progressPercent: 0,
    });
  });
});

describe("getPlayerStats", () => {
  it("returns null when the player has no PlayerCareerStat row", async () => {
    await seedServer();

    const result = await getPlayerStats(db, BASE_URL, "unknown");

    expect(result).toBeNull();
  });

  it("returns the player's lifetime stats", async () => {
    const server = await seedServer();
    await db.insert(playerCareerStats).values({
      serverId: server.id,
      steamId: "1",
      displayName: "Alice",
      kills: 30,
      deaths: 6,
      cash: 2500,
      matchesPlayed: 10,
      matchesWon: 6,
      matchesLost: 4,
      highestKillStreak: 12,
      currentKillStreak: 3,
      mvpCount: 2,
    });

    const result = await getPlayerStats(db, BASE_URL, "1");

    expect(result).toEqual({
      steamId: "1",
      kills: 30,
      deaths: 6,
      kd: 5,
      cash: 2500,
      matchesPlayed: 10,
      matchesWon: 6,
      matchesLost: 4,
      highestKillStreak: 12,
      currentKillStreak: 3,
      mvpCount: 2,
    });
  });

  it("renders zeroed defaults for a player with no gamification activity yet", async () => {
    const server = await seedServer();
    await db.insert(playerCareerStats).values({
      serverId: server.id,
      steamId: "1",
      displayName: "Alice",
    });

    const result = await getPlayerStats(db, BASE_URL, "1");

    expect(result).toEqual({
      steamId: "1",
      kills: 0,
      deaths: 0,
      kd: 0,
      cash: 0,
      matchesPlayed: 0,
      matchesWon: 0,
      matchesLost: 0,
      highestKillStreak: 0,
      currentKillStreak: 0,
      mvpCount: 0,
    });
  });
});

describe("getPlayerAchievements", () => {
  it("returns an empty list when the Server isn't seeded", async () => {
    const result = await getPlayerAchievements(db, BASE_URL, "1");
    expect(result).toEqual([]);
  });

  it("returns an empty list for a player with no unlocked Achievements", async () => {
    const server = await seedServer();
    await db.insert(playerCareerStats).values({ serverId: server.id, steamId: "1", displayName: "Alice" });

    const result = await getPlayerAchievements(db, BASE_URL, "1");

    expect(result).toEqual([]);
  });

  it("returns the player's unlocked Achievements, most recently unlocked first", async () => {
    const server = await seedServer();
    const [older] = await db
      .insert(playerAchievements)
      .values({
        serverId: server.id,
        steamId: "1",
        achievementId: "first_blood",
        unlockedAt: new Date("2026-03-01T00:00:00Z"),
      })
      .returning();
    const [newer] = await db
      .insert(playerAchievements)
      .values({
        serverId: server.id,
        steamId: "1",
        achievementId: "killing_spree",
        unlockedAt: new Date("2026-03-05T00:00:00Z"),
      })
      .returning();
    // Another player's unlock must not leak in.
    await db.insert(playerAchievements).values({
      serverId: server.id,
      steamId: "2",
      achievementId: "rampage",
    });

    const result = await getPlayerAchievements(db, BASE_URL, "1");

    expect(result).toEqual([
      {
        id: "killing_spree",
        name: "Killing Spree",
        description: "Reach a 5 kill streak",
        unlockedAt: newer.unlockedAt.toISOString(),
      },
      {
        id: "first_blood",
        name: "First Blood",
        description: "Get your first kill",
        unlockedAt: older.unlockedAt.toISOString(),
      },
    ]);
  });
});

describe("getPlayerChallengeProgress", () => {
  const asOf = new Date("2026-03-05T12:00:00Z");

  it("returns an empty list when no Challenges are active for the period", async () => {
    const server = await seedServer();
    await db.insert(playerCareerStats).values({ serverId: server.id, steamId: "1", displayName: "Alice" });

    const result = await getPlayerChallengeProgress(db, BASE_URL, "1", asOf);

    expect(result).toEqual([]);
  });

  it("reports the player's own progress and completion per active instance", async () => {
    const server = await seedServer();
    const definition = await insertChallengeDefinition({ type: "kills", target: 20, xpReward: 150 });
    const [instance] = await db
      .insert(challengeInstances)
      .values({ definitionId: definition.id, serverId: server.id, periodKey: "2026-03-05" })
      .returning();
    await db.insert(playerChallengeProgress).values([
      { instanceId: instance.id, steamId: "1", progress: 20 },
      { instanceId: instance.id, steamId: "2", progress: 5 },
    ]);
    await db.insert(challengeCompletions).values({ instanceId: instance.id, steamId: "1" });

    const result = await getPlayerChallengeProgress(db, BASE_URL, "1", asOf);

    expect(result).toEqual([
      {
        instanceId: instance.id,
        type: "kills",
        description: "Get 20 kills",
        target: 20,
        progress: 20,
        xpReward: 150,
        completed: true,
      },
    ]);
  });

  it("defaults to zero progress and not completed for a player with no gamification activity yet", async () => {
    const server = await seedServer();
    const definition = await insertChallengeDefinition({ type: "wins", target: 3, xpReward: 300 });
    const [instance] = await db
      .insert(challengeInstances)
      .values({ definitionId: definition.id, serverId: server.id, periodKey: "2026-03-05" })
      .returning();

    const result = await getPlayerChallengeProgress(db, BASE_URL, "1", asOf);

    expect(result).toEqual([
      {
        instanceId: instance.id,
        type: "wins",
        description: "Win 3 matches",
        target: 3,
        progress: 0,
        xpReward: 300,
        completed: false,
      },
    ]);
  });
});
