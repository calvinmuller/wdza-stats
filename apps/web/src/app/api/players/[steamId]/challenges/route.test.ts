import {
  challengeCompletions,
  challengeDefinitions,
  challengeInstances,
  createDb,
  playerCareerStats,
  playerChallengeProgress,
  servers,
  type Database,
} from "@wdza-stats/db";
import { inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = process.env.RCON_BASE_URL!;

const insertedDefinitionIds: number[] = [];

afterEach(async () => {
  await db.delete(challengeCompletions);
  await db.delete(playerChallengeProgress);
  await db.delete(challengeInstances);
  if (insertedDefinitionIds.length > 0) {
    await db.delete(challengeDefinitions).where(inArray(challengeDefinitions.id, insertedDefinitionIds));
    insertedDefinitionIds.length = 0;
  }
  await db.delete(playerCareerStats);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

function request(steamId: string) {
  return new Request(`http://test/api/players/${steamId}/challenges`);
}

// Uses today's UTC date as the periodKey, mirroring dailyPeriodKey, since
// the route calls getPlayerChallengeProgress with no explicit `asOf` (a
// plain API request has no Snapshot context to draw one from).
function todayPeriodKey() {
  return new Date().toISOString().slice(0, 10);
}

describe("GET /api/players/[steamId]/challenges", () => {
  it("returns an empty list when no Challenges are active today", async () => {
    await db.insert(servers).values({ name: "WDZA Test", baseUrl: BASE_URL });

    const response = await GET(request("1"), {
      params: Promise.resolve({ steamId: "1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([]);
  });

  it("defaults to zero progress and not completed for a player with no gamification activity yet", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();
    await db.insert(playerCareerStats).values({
      serverId: server.id,
      steamId: "1",
      displayName: "Alice",
    });
    const [definition] = await db
      .insert(challengeDefinitions)
      .values({ type: "wins", scope: "daily", target: 3, xpReward: 300 })
      .returning();
    insertedDefinitionIds.push(definition.id);
    const [instance] = await db
      .insert(challengeInstances)
      .values({ definitionId: definition.id, serverId: server.id, periodKey: todayPeriodKey() })
      .returning();

    const response = await GET(request("1"), {
      params: Promise.resolve({ steamId: "1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([
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

  it("reports the player's own progress and completion per active instance", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();
    const [definition] = await db
      .insert(challengeDefinitions)
      .values({ type: "kills", scope: "daily", target: 20, xpReward: 150 })
      .returning();
    insertedDefinitionIds.push(definition.id);
    const [instance] = await db
      .insert(challengeInstances)
      .values({ definitionId: definition.id, serverId: server.id, periodKey: todayPeriodKey() })
      .returning();
    await db.insert(playerChallengeProgress).values({ instanceId: instance.id, steamId: "1", progress: 20 });
    await db.insert(challengeCompletions).values({ instanceId: instance.id, steamId: "1" });

    const response = await GET(request("1"), {
      params: Promise.resolve({ steamId: "1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([
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
});
