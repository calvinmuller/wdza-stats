import {
  challengeCompletions,
  challengeDefinitions,
  challengeInstances,
  createDb,
  type ChallengeScope,
  type ChallengeType,
  type Database,
  playerChallengeProgress,
  servers,
} from "@wdza-stats/db";
import { inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { describeChallenge, getActiveChallenges } from "./active-challenges";

const db: Database = createDb(process.env.DATABASE_URL!);

// challengeDefinitions is shared, migration-seeded config (see schema.ts) -
// other suites (e.g. apps/worker's match-tracker.test.ts) rely on those
// default rows staying in place, so this file's own throwaway definitions
// are tracked here and deleted by id rather than blanket-deleting the whole
// table.
const insertedDefinitionIds: number[] = [];

async function insertChallengeDefinition(values: {
  type: ChallengeType;
  scope: ChallengeScope;
  target: number;
  xpReward: number;
}) {
  const [row] = await db.insert(challengeDefinitions).values(values).returning();
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
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

describe("describeChallenge", () => {
  it("renders a human-readable goal for every ChallengeType", () => {
    expect(describeChallenge("kills", 20)).toBe("Get 20 kills");
    expect(describeChallenge("wins", 3)).toBe("Win 3 matches");
    expect(describeChallenge("matches_played", 5)).toBe("Play 5 matches");
    expect(describeChallenge("kill_streak", 10)).toBe("Reach a 10-kill streak");
    expect(describeChallenge("kills_in_match", 15)).toBe("Get 15 kills in a single match");
    expect(describeChallenge("kills_without_dying", 8)).toBe("Get 8 kills without dying");
  });
});

describe("getActiveChallenges", () => {
  it("returns nothing when the Server has no ChallengeInstance for the given period", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: "http://rcon.test:9006" })
      .returning();

    const result = await getActiveChallenges(db, server.id, new Date("2026-03-05T12:00:00Z"));

    expect(result).toEqual([]);
  });

  it("returns each active instance's definition and overall status, unaffected by other periods or Servers", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: "http://rcon.test:9006" })
      .returning();
    const [otherServer] = await db
      .insert(servers)
      .values({ name: "Other Server", baseUrl: "http://other.test:9006" })
      .returning();

    const killsDefinition = await insertChallengeDefinition({ type: "kills", scope: "daily", target: 20, xpReward: 150 });
    const winsDefinition = await insertChallengeDefinition({ type: "wins", scope: "daily", target: 3, xpReward: 300 });

    const [killsInstance] = await db
      .insert(challengeInstances)
      .values({ definitionId: killsDefinition.id, serverId: server.id, periodKey: "2026-03-05" })
      .returning();
    await db
      .insert(challengeInstances)
      .values({ definitionId: winsDefinition.id, serverId: server.id, periodKey: "2026-03-04" });
    // Same definition/period on a different Server - must not leak in.
    await db
      .insert(challengeInstances)
      .values({ definitionId: killsDefinition.id, serverId: otherServer.id, periodKey: "2026-03-05" });

    await db.insert(playerChallengeProgress).values([
      { instanceId: killsInstance.id, steamId: "1", progress: 20 },
      { instanceId: killsInstance.id, steamId: "2", progress: 7 },
    ]);
    await db.insert(challengeCompletions).values({ instanceId: killsInstance.id, steamId: "1" });

    const result = await getActiveChallenges(db, server.id, new Date("2026-03-05T12:00:00Z"));

    expect(result).toEqual([
      {
        instanceId: killsInstance.id,
        type: "kills",
        description: "Get 20 kills",
        target: 20,
        xpReward: 150,
        participantCount: 2,
        completedCount: 1,
      },
    ]);
  });

  it("returns zero counts for an active instance nobody has made progress on yet", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: "http://rcon.test:9006" })
      .returning();
    const definition = await insertChallengeDefinition({ type: "kill_streak", scope: "daily", target: 10, xpReward: 500 });
    const [instance] = await db
      .insert(challengeInstances)
      .values({ definitionId: definition.id, serverId: server.id, periodKey: "2026-03-05" })
      .returning();

    const result = await getActiveChallenges(db, server.id, new Date("2026-03-05T00:00:00Z"));

    expect(result).toEqual([
      {
        instanceId: instance.id,
        type: "kill_streak",
        description: "Reach a 10-kill streak",
        target: 10,
        xpReward: 500,
        participantCount: 0,
        completedCount: 0,
      },
    ]);
  });
});
