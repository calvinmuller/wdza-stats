import {
  challengeCompletions,
  challengeDefinitions,
  challengeInstances,
  dailyPeriodKey,
  playerChallengeProgress,
  type ChallengeType,
  type Database,
} from "@wdza-stats/db";
import { and, count, eq, inArray } from "drizzle-orm";

// Human-readable description of a ChallengeDefinition's goal - see
// packages/db/src/challenge.ts's ChallengeType doc comment for what each
// type actually measures.
const CHALLENGE_TYPE_DESCRIPTIONS: Record<ChallengeType, (target: number) => string> = {
  kills: (target) => `Get ${target} kills`,
  wins: (target) => `Win ${target} matches`,
  matches_played: (target) => `Play ${target} matches`,
  kill_streak: (target) => `Reach a ${target}-kill streak`,
  kills_in_match: (target) => `Get ${target} kills in a single match`,
  kills_without_dying: (target) => `Get ${target} kills without dying`,
};

export function describeChallenge(type: ChallengeType, target: number): string {
  return CHALLENGE_TYPE_DESCRIPTIONS[type](target);
}

// No authenticated-viewer concept exists in this codebase yet (see spec.md's
// "No new authentication system" decision), so every ActiveChallengeView
// always carries the "otherwise" branch of ticket 14's requirement: the
// ChallengeDefinition itself plus this period's overall status across every
// player, never one viewer's own progress.
export interface ActiveChallengeView {
  instanceId: number;
  type: ChallengeType;
  description: string;
  target: number;
  xpReward: number;
  // Players with any recorded progress toward this instance.
  participantCount: number;
  // Players who reached this instance's target.
  completedCount: number;
}

/**
 * The Server's currently active daily ChallengeInstances (today's UTC period,
 * per `dailyPeriodKey`) plus each one's overall status - how many players
 * have made progress and how many have completed it. `asOf` should be the
 * Snapshot's own capturedAt (see live-snapshot.ts's getLiveSnapshot) rather
 * than wall-clock time, so the dashboard always asks for the same period the
 * Worker most recently generated instances for.
 */
export async function getActiveChallenges(
  db: Database,
  serverId: number,
  asOf: Date,
): Promise<ActiveChallengeView[]> {
  const periodKey = dailyPeriodKey(asOf);

  const instances = await db
    .select({
      instanceId: challengeInstances.id,
      type: challengeDefinitions.type,
      target: challengeDefinitions.target,
      xpReward: challengeDefinitions.xpReward,
    })
    .from(challengeInstances)
    .innerJoin(challengeDefinitions, eq(challengeInstances.definitionId, challengeDefinitions.id))
    .where(and(eq(challengeInstances.serverId, serverId), eq(challengeInstances.periodKey, periodKey)));

  if (instances.length === 0) {
    return [];
  }

  const instanceIds = instances.map((instance) => instance.instanceId);

  const [participantCounts, completionCounts] = await Promise.all([
    db
      .select({ instanceId: playerChallengeProgress.instanceId, value: count() })
      .from(playerChallengeProgress)
      .where(inArray(playerChallengeProgress.instanceId, instanceIds))
      .groupBy(playerChallengeProgress.instanceId),
    db
      .select({ instanceId: challengeCompletions.instanceId, value: count() })
      .from(challengeCompletions)
      .where(inArray(challengeCompletions.instanceId, instanceIds))
      .groupBy(challengeCompletions.instanceId),
  ]);

  const participantCountByInstance = new Map(
    participantCounts.map((row) => [row.instanceId, row.value]),
  );
  const completedCountByInstance = new Map(
    completionCounts.map((row) => [row.instanceId, row.value]),
  );

  return instances.map((instance) => ({
    instanceId: instance.instanceId,
    type: instance.type,
    description: describeChallenge(instance.type, instance.target),
    target: instance.target,
    xpReward: instance.xpReward,
    participantCount: participantCountByInstance.get(instance.instanceId) ?? 0,
    completedCount: completedCountByInstance.get(instance.instanceId) ?? 0,
  }));
}
