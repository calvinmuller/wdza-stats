import {
  achievementDefinitions,
  challengeCompletions,
  challengeDefinitions,
  challengeInstances,
  gameEvents,
  latestSnapshots,
  levelForXp,
  levelThresholds,
  matchSnapshots,
  matches,
  mvpFormulaWeights,
  notificationRules,
  notificationSettings,
  notifications,
  playerAchievements,
  playerCareerStats,
  playerChallengeProgress,
  playerMatchStats,
  xpRewards,
  xpTransactions,
  type ChallengeType,
  type Database,
  type GameEventType,
  type NotificationKind,
  type Snapshot,
  type SnapshotPlayer,
  type XpReason,
} from "@wdza-stats/db";
import { and, desc, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  achievementUnlockedEvents,
  computeAchievementUnlockDrafts,
  type AchievementContext,
  type AchievementDefinitionConfig,
  type AchievementUnlockDraft,
  type RecordedAchievementUnlock,
} from "./achievement-engine";
import {
  computeChallengeProgressUpdates,
  dailyChallengeInstanceDrafts,
  dailyPeriodKey,
  type ActiveChallengeInstance,
  type ChallengeProgressContext,
  type ChallengeProgressUpdate,
} from "./challenge-engine";
import {
  diffFactionScoreGameEvents,
  diffKillDeathGameEvents,
  diffKillStreakGameEvents,
  diffRosterGameEvents,
  matchLifecycleEvent,
  soleLeader,
  type GameEventDraft,
  type KillStreakUpdate,
  type GameEventContext,
} from "./game-events";
import { levelUpEvents } from "./level-engine";
import { computeMvp, type MvpFormulaWeights } from "./mvp-engine";
import {
  applyNotificationThrottle,
  computeNotificationDrafts,
  type ChallengeCompletionNotificationInfo,
  type NotificationContext,
  type NotificationDraft,
  type NotificationRuleConfig,
} from "./notification-engine";
import {
  computeXpTransactionDrafts,
  type MatchCompletionInfo,
  type RecordedGameEvent,
  type XpTransactionContext,
  type XpTransactionDraft,
} from "./xp-engine";

/**
 * True when comparing `previous` to `next` indicates a new Match has begun:
 * a changed map, a changed rotation position, or any player's cumulative
 * kills/deaths/cash dropping below their prior value. `lighting` and
 * `alternator` changes are not boundary signals - see
 * docs/adr/0001-infer-match-boundaries-from-snapshot-deltas.md.
 */
export function detectMatchBoundary(previous: Snapshot, next: Snapshot): boolean {
  if (previous.map !== next.map) {
    return true;
  }
  if (previous.rotation.nowIndex !== next.rotation.nowIndex) {
    return true;
  }

  const previousBySteamId = new Map(
    previous.players.map((player) => [player.steamId, player]),
  );

  return next.players.some((player) => {
    const previousPlayer = previousBySteamId.get(player.steamId);
    if (!previousPlayer) {
      return false;
    }
    return (
      player.kills < previousPlayer.kills ||
      player.deaths < previousPlayer.deaths ||
      player.cash < previousPlayer.cash
    );
  });
}

export interface PlayerDelta {
  steamId: string;
  displayName: string;
  faction: string;
  kills: number;
  deaths: number;
  cash: number;
}

/**
 * For every steamId observed across a closed Match's Snapshots (given in
 * capture order), computes the delta between their first- and
 * last-observed counter values, attributing the Faction seen at their last
 * Snapshot in the Match.
 */
export function computePlayerDeltas(snapshots: Snapshot[]): PlayerDelta[] {
  const firstSeen = new Map<string, SnapshotPlayer>();
  const lastSeen = new Map<string, SnapshotPlayer>();

  for (const snapshot of snapshots) {
    for (const player of snapshot.players) {
      if (!firstSeen.has(player.steamId)) {
        firstSeen.set(player.steamId, player);
      }
      lastSeen.set(player.steamId, player);
    }
  }

  return Array.from(firstSeen.keys()).map((steamId) => {
    const first = firstSeen.get(steamId)!;
    const last = lastSeen.get(steamId)!;
    return {
      steamId,
      displayName: last.displayName,
      faction: last.faction,
      kills: last.kills - first.kills,
      deaths: last.deaths - first.deaths,
      cash: last.cash - first.cash,
    };
  });
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Persists a batch of GameEventDrafts and returns the slice of each actually
 * inserted row that computeXpTransactionDrafts/logging need. Shared by
 * ingestSnapshot's two insertion points - the Snapshot-diff batch and the
 * PlayerLevelUp batch computed afterward from that batch's resulting XP -
 * since both rely on the same onConflictDoNothing(idempotencyKey) dedupe and
 * the same returning() shape.
 */
async function insertGameEventDrafts(tx: Tx, drafts: GameEventDraft[]): Promise<RecordedGameEvent[]> {
  if (drafts.length === 0) {
    return [];
  }
  return tx
    .insert(gameEvents)
    .values(drafts)
    .onConflictDoNothing({ target: gameEvents.idempotencyKey })
    .returning({
      id: gameEvents.id,
      type: gameEvents.type,
      steamId: gameEvents.steamId,
      matchId: gameEvents.matchId,
      metadata: gameEvents.metadata,
    });
}

/**
 * The Faction with the highest score in a Match's final Snapshot - "first to
 * 100" is enforced server-side, so whoever leads when the Match ends is the
 * winner. Delegates to soleLeader for the actual strict-overtake comparison
 * (see game-events.ts), matching FactionTookLead's own semantics (ticket
 * 07): a tied final score has no winner, not an arbitrary pick. Returns null
 * when the final Snapshot recorded no Factions, or when the top score is
 * tied.
 */
export function winningFaction(finalSnapshot: Snapshot): string | null {
  return soleLeader(finalSnapshot.factions)?.name ?? null;
}

/**
 * The current MVP_FORMULA_WEIGHTS config, read fresh on every Match close so
 * the formula can be retuned without a deploy (see schema.ts's
 * mvpFormulaWeights). A component missing from the table contributes 0
 * rather than falling back to a hardcoded default, matching xpRewards'
 * missing-reason handling in xp-engine.ts.
 */
async function fetchMvpFormulaWeights(tx: Tx): Promise<MvpFormulaWeights> {
  const rows = await tx.select().from(mvpFormulaWeights);
  const byComponent = new Map(rows.map((row) => [row.component, row.weight]));
  return {
    killWeight: byComponent.get("kills") ?? 0,
    deathWeight: byComponent.get("deaths") ?? 0,
  };
}

export interface MatchCloseSummary {
  winner: string | null;
  mvpPlayerSteamId: string | null;
  mvpScore: number | null;
  playerCount: number;
}

/**
 * Closes an open Match: computes each observed player's delta from its
 * retained matchSnapshots, writes PlayerMatchStat rows, rolls those deltas
 * into PlayerCareerStat (kills/deaths/cash/matchesPlayed, plus
 * matchesWon/matchesLost/mvpCount per ticket 07), stamps endedAt/
 * winningFaction/mvpPlayerSteamId/mvpScore, and drops the now-redundant raw
 * Snapshots for that Match. Returns a summary for the caller to log once the
 * enclosing transaction has actually committed.
 *
 * Idempotent under reprocessing (ticket 07): the very first write is a
 * conditional claim of `endedAt` (`WHERE endedAt IS NULL`), so a second call
 * for the same already-closed Match finds no row to claim and returns early
 * without touching PlayerMatchStat/PlayerCareerStat again - every increment
 * below only ever runs once per Match, no matter how many times this
 * function itself is invoked for it.
 */
export async function closeMatch(
  tx: Tx,
  match: { id: number; serverId: number },
  endedAt: Date,
): Promise<MatchCloseSummary> {
  const [claimed] = await tx
    .update(matches)
    .set({ endedAt })
    .where(and(eq(matches.id, match.id), isNull(matches.endedAt)))
    .returning({ id: matches.id });

  if (!claimed) {
    const [existing] = await tx.select().from(matches).where(eq(matches.id, match.id));
    return {
      winner: existing.winningFaction,
      mvpPlayerSteamId: existing.mvpPlayerSteamId,
      mvpScore: existing.mvpScore,
      playerCount: 0,
    };
  }

  const rows = await tx
    .select()
    .from(matchSnapshots)
    .where(eq(matchSnapshots.matchId, match.id))
    .orderBy(matchSnapshots.capturedAt);

  const deltas = computePlayerDeltas(rows.map((row) => row.payload));
  const winner = winningFaction(rows[rows.length - 1].payload);
  const weights = await fetchMvpFormulaWeights(tx);
  const mvp = computeMvp(deltas, weights);

  for (const delta of deltas) {
    const won = winner !== null && delta.faction === winner;
    const lost = winner !== null && delta.faction !== winner;
    const isMvp = mvp !== null && delta.steamId === mvp.steamId;

    await tx.insert(playerMatchStats).values({
      matchId: match.id,
      steamId: delta.steamId,
      faction: delta.faction,
      kills: delta.kills,
      deaths: delta.deaths,
      cash: delta.cash,
    });

    await tx
      .insert(playerCareerStats)
      .values({
        serverId: match.serverId,
        steamId: delta.steamId,
        displayName: delta.displayName,
        kills: delta.kills,
        deaths: delta.deaths,
        cash: delta.cash,
        matchesPlayed: 1,
        matchesWon: won ? 1 : 0,
        matchesLost: lost ? 1 : 0,
        mvpCount: isMvp ? 1 : 0,
      })
      .onConflictDoUpdate({
        target: [playerCareerStats.serverId, playerCareerStats.steamId],
        set: {
          displayName: delta.displayName,
          kills: sql`${playerCareerStats.kills} + ${delta.kills}`,
          deaths: sql`${playerCareerStats.deaths} + ${delta.deaths}`,
          cash: sql`${playerCareerStats.cash} + ${delta.cash}`,
          matchesPlayed: sql`${playerCareerStats.matchesPlayed} + 1`,
          matchesWon: sql`${playerCareerStats.matchesWon} + ${won ? 1 : 0}`,
          matchesLost: sql`${playerCareerStats.matchesLost} + ${lost ? 1 : 0}`,
          mvpCount: sql`${playerCareerStats.mvpCount} + ${isMvp ? 1 : 0}`,
        },
      });
  }

  await tx
    .update(matches)
    .set({ winningFaction: winner, mvpPlayerSteamId: mvp?.steamId ?? null, mvpScore: mvp?.score ?? null })
    .where(eq(matches.id, match.id));
  await tx.delete(matchSnapshots).where(eq(matchSnapshots.matchId, match.id));

  return {
    winner,
    mvpPlayerSteamId: mvp?.steamId ?? null,
    mvpScore: mvp?.score ?? null,
    playerCount: deltas.length,
  };
}

/**
 * Persists each affected player's resulting kill-streak state to
 * playerCareerStats - an upsert (rather than a plain update) since a
 * player's very first Match hasn't closed yet by the time their first kill
 * happens, so no playerCareerStats row may exist for them at all (see
 * ticket 01/closeMatch). highestKillStreak is raised via GREATEST rather
 * than overwritten, so it never regresses below a value persisted by an
 * earlier Match.
 */
async function applyKillStreakUpdates(
  tx: Tx,
  serverId: number,
  updates: KillStreakUpdate[],
): Promise<void> {
  for (const update of updates) {
    await tx
      .insert(playerCareerStats)
      .values({
        serverId,
        steamId: update.steamId,
        displayName: update.displayName,
        currentKillStreak: update.currentKillStreak,
        highestKillStreak: update.highestKillStreak,
      })
      .onConflictDoUpdate({
        target: [playerCareerStats.serverId, playerCareerStats.steamId],
        set: {
          displayName: update.displayName,
          currentKillStreak: update.currentKillStreak,
          highestKillStreak: sql`GREATEST(${playerCareerStats.highestKillStreak}, ${update.highestKillStreak})`,
        },
      });
  }
}

/**
 * Gathers the extra per-Match state computeXpTransactionDrafts needs beyond
 * the recorded events themselves: the current XP_REWARDS config, each
 * relevant Match's earliest-recorded PlayerKilled event id (for
 * first_blood), and - for a Match this same batch closed - its participant
 * roster and winning Faction (for match_completed/match_win). Queried fresh
 * every call rather than cached, matching this file's existing per-poll
 * query style (e.g. currentStreaks in ingestSnapshot) at a volume too low to
 * matter.
 */
async function buildXpTransactionContext(
  tx: Tx,
  serverId: number,
  recordedEvents: RecordedGameEvent[],
  closedMatch: { id: number; winner: string | null } | undefined,
): Promise<XpTransactionContext> {
  const rewardRows = await tx.select().from(xpRewards);
  const rewards = new Map<XpReason, number>(rewardRows.map((row) => [row.reason, row.amount]));

  const killMatchIds = [...new Set(
    recordedEvents.filter((event) => event.type === "PlayerKilled").map((event) => event.matchId),
  )];
  const firstKillEventIdByMatch = new Map<number, number>();
  for (const matchId of killMatchIds) {
    const [row] = await tx
      .select({ id: sql<number>`MIN(${gameEvents.id})` })
      .from(gameEvents)
      .where(and(eq(gameEvents.matchId, matchId), eq(gameEvents.type, "PlayerKilled" satisfies GameEventType)));
    if (row?.id != null) {
      firstKillEventIdByMatch.set(matchId, row.id);
    }
  }

  const matchCompletions: XpTransactionContext["matchCompletions"] = new Map();
  const hasMatchEnded = recordedEvents.some((event) => event.type === "MatchEnded");
  if (hasMatchEnded && closedMatch) {
    const participants = await tx
      .select({ steamId: playerMatchStats.steamId, faction: playerMatchStats.faction })
      .from(playerMatchStats)
      .where(eq(playerMatchStats.matchId, closedMatch.id));
    matchCompletions.set(closedMatch.id, { winningFaction: closedMatch.winner, participants });
  }

  return { serverId, xpRewards: rewards, firstKillEventIdByMatch, matchCompletions };
}

/**
 * Persists a batch of XpTransactionDrafts to the xp_transactions ledger and
 * rolls each actually-inserted amount into playerCareerStats.xp. The
 * insert's (event_id, reason, steam_id) uniqueness is what makes a draft
 * idempotent: persisting the same draft twice (e.g. a reprocessed
 * GameEvent) inserts nothing the second time, via onConflictDoNothing, so
 * the returning() rows - and thus the xp increment - only ever reflect
 * genuinely new transactions. steam_id is part of that key (not just
 * event_id+reason) because a single MatchEnded event fans out
 * match_completed/match_win to every participant under one eventId - see
 * xpTransactions' own doc comment in schema.ts. Uses a plain UPDATE rather
 * than an upsert: every reason here fires only after a step that already
 * guarantees the target playerCareerStats row exists (applyKillStreakUpdates
 * for kill/first_blood/streak reasons, closeMatch for
 * match_completed/match_win), unlike applyKillStreakUpdates itself. Returns
 * the actually-inserted transactions for the caller to log once the
 * enclosing transaction has committed.
 *
 * `drafts` must be homogeneous - every reason "challenge_completed" or every
 * reason something else, never a mix - since which of xpTransactions' two
 * partial unique indexes is the right ON CONFLICT arbiter depends on that
 * (see schema.ts's xpTransactions doc comment). Both of this function's
 * callers already satisfy this: computeXpTransactionDrafts never produces
 * "challenge_completed", and the challenge completion batch built from
 * applyChallengeProgressUpdates' results is that reason exclusively.
 */
export async function applyXpTransactionDrafts(
  tx: Tx,
  drafts: XpTransactionDraft[],
): Promise<XpTransactionDraft[]> {
  if (drafts.length === 0) {
    return [];
  }

  const isChallengeCompletion = drafts[0].reason === "challenge_completed";

  const inserted = await tx
    .insert(xpTransactions)
    .values(drafts)
    .onConflictDoNothing(
      isChallengeCompletion
        ? {
            target: [xpTransactions.eventId, xpTransactions.steamId, xpTransactions.challengeInstanceId],
            where: sql`${xpTransactions.reason} = 'challenge_completed'`,
          }
        : {
            target: [xpTransactions.eventId, xpTransactions.reason, xpTransactions.steamId],
            where: sql`${xpTransactions.reason} <> 'challenge_completed'`,
          },
    )
    .returning({
      serverId: xpTransactions.serverId,
      steamId: xpTransactions.steamId,
      amount: xpTransactions.amount,
      reason: xpTransactions.reason,
      eventId: xpTransactions.eventId,
    });

  for (const transaction of inserted) {
    await tx
      .update(playerCareerStats)
      .set({ xp: sql`${playerCareerStats.xp} + ${transaction.amount}` })
      .where(
        and(
          eq(playerCareerStats.serverId, transaction.serverId),
          eq(playerCareerStats.steamId, transaction.steamId),
        ),
      );
  }

  return inserted;
}

/**
 * Generates today's ChallengeInstance rows for every "daily"-scoped
 * ChallengeDefinition on `serverId`, if they don't already exist - see
 * schema.ts's challengeInstances doc comment and challenge-engine.ts's
 * dailyChallengeInstanceDrafts. Safe to call on every poll: the insert's own
 * (definition_id, server_id, period_key) uniqueness makes a duplicate call
 * for a day that's already generated a no-op, which is what makes this safe
 * even if a future second worker instance calls it concurrently.
 */
async function ensureDailyChallengeInstances(tx: Tx, serverId: number, periodKey: string): Promise<void> {
  const definitionRows = await tx
    .select({ id: challengeDefinitions.id, scope: challengeDefinitions.scope })
    .from(challengeDefinitions);
  const drafts = dailyChallengeInstanceDrafts(definitionRows, serverId, periodKey);
  if (drafts.length === 0) {
    return;
  }

  await tx
    .insert(challengeInstances)
    .values(drafts)
    .onConflictDoNothing({
      target: [challengeInstances.definitionId, challengeInstances.serverId, challengeInstances.periodKey],
    });
}

/**
 * Gathers the extra state computeChallengeProgressUpdates needs beyond the
 * recorded events themselves: this period's active ChallengeInstances
 * (joined with their ChallengeDefinition for type/target/xpReward), each
 * relevant player's current progress on each of them, and - for
 * "kills_in_match" instances only - each relevant player's total kill count
 * within the Match a qualifying PlayerKilled event belongs to. Queried fresh
 * every call rather than cached, matching buildXpTransactionContext's own
 * precedent. `matchCompletions` is passed in rather than requeried - it's the
 * exact same participant roster/winning-Faction shape
 * buildXpTransactionContext already computed this poll for
 * match_completed/match_win.
 */
async function buildChallengeProgressContext(
  tx: Tx,
  periodKey: string,
  serverId: number,
  recordedEvents: RecordedGameEvent[],
  matchCompletions: Map<number, MatchCompletionInfo>,
): Promise<ChallengeProgressContext> {
  const instanceRows = await tx
    .select({
      instanceId: challengeInstances.id,
      type: challengeDefinitions.type,
      target: challengeDefinitions.target,
      xpReward: challengeDefinitions.xpReward,
    })
    .from(challengeInstances)
    .innerJoin(challengeDefinitions, eq(challengeInstances.definitionId, challengeDefinitions.id))
    .where(and(eq(challengeInstances.serverId, serverId), eq(challengeInstances.periodKey, periodKey)));

  const instancesByType = new Map<ChallengeType, ActiveChallengeInstance[]>();
  for (const row of instanceRows) {
    const list = instancesByType.get(row.type) ?? [];
    list.push({ instanceId: row.instanceId, target: row.target, xpReward: row.xpReward });
    instancesByType.set(row.type, list);
  }

  if (instanceRows.length === 0) {
    return {
      instancesByType,
      currentProgress: new Map(),
      matchCompletions,
      killCountInMatch: new Map(),
      killsSinceDeath: new Map(),
    };
  }

  const relevantSteamIds = [
    ...new Set(
      recordedEvents.map((event) => event.steamId).filter((steamId): steamId is string => steamId != null),
    ),
  ];
  const instanceIds = instanceRows.map((row) => row.instanceId);
  const currentProgress = new Map<string, number>();
  if (relevantSteamIds.length > 0) {
    const progressRows = await tx
      .select()
      .from(playerChallengeProgress)
      .where(
        and(
          inArray(playerChallengeProgress.instanceId, instanceIds),
          inArray(playerChallengeProgress.steamId, relevantSteamIds),
        ),
      );
    for (const row of progressRows) {
      currentProgress.set(`${row.instanceId}:${row.steamId}`, row.progress);
    }
  }

  const killEvents = recordedEvents.filter(
    (event): event is RecordedGameEvent & { steamId: string } => event.type === "PlayerKilled" && event.steamId != null,
  );

  const killCountInMatch = new Map<string, number>();
  if (killEvents.length > 0 && instancesByType.has("kills_in_match")) {
    const matchIds = [...new Set(killEvents.map((event) => event.matchId))];
    const steamIds = [...new Set(killEvents.map((event) => event.steamId))];
    const rows = await tx
      .select({ matchId: gameEvents.matchId, steamId: gameEvents.steamId, count: sql<number>`COUNT(*)` })
      .from(gameEvents)
      .where(
        and(
          inArray(gameEvents.matchId, matchIds),
          inArray(gameEvents.steamId, steamIds),
          eq(gameEvents.type, "PlayerKilled" satisfies GameEventType),
        ),
      )
      .groupBy(gameEvents.matchId, gameEvents.steamId);
    for (const row of rows) {
      if (row.steamId) {
        killCountInMatch.set(`${row.matchId}:${row.steamId}`, Number(row.count));
      }
    }
  }

  // Match-independent, unlike killCountInMatch above (see challenge.ts's
  // ChallengeType doc comment): counts each relevant player's PlayerKilled
  // events since their most recent PlayerDeath on this Server, wherever that
  // death fell. One small pair of queries per player rather than a single
  // batched query, since "since their own last death" doesn't reduce to one
  // shared GROUP BY the way killCountInMatch's flat per-Match count does.
  const killsSinceDeath = new Map<string, number>();
  if (instancesByType.has("kills_without_dying")) {
    const steamIds = [...new Set(killEvents.map((event) => event.steamId))];
    for (const steamId of steamIds) {
      const [lastDeath] = await tx
        .select({ id: sql<number>`MAX(${gameEvents.id})` })
        .from(gameEvents)
        .where(
          and(
            eq(gameEvents.serverId, serverId),
            eq(gameEvents.steamId, steamId),
            eq(gameEvents.type, "PlayerDeath" satisfies GameEventType),
          ),
        );
      const sinceEventId = lastDeath?.id ?? 0;
      const [killsSince] = await tx
        .select({ count: sql<number>`COUNT(*)` })
        .from(gameEvents)
        .where(
          and(
            eq(gameEvents.serverId, serverId),
            eq(gameEvents.steamId, steamId),
            eq(gameEvents.type, "PlayerKilled" satisfies GameEventType),
            sql`${gameEvents.id} > ${sinceEventId}`,
          ),
        );
      killsSinceDeath.set(steamId, Number(killsSince?.count ?? 0));
    }
  }

  return { instancesByType, currentProgress, matchCompletions, killCountInMatch, killsSinceDeath };
}

interface ChallengeCompletionResult {
  instanceId: number;
  steamId: string;
  eventId: number;
  xpReward: number;
}

/**
 * Persists a batch of ChallengeProgressUpdates to player_challenge_progress
 * (an upsert, setting each instance's new absolute progress value directly -
 * see challenge-engine.ts's ChallengeProgressUpdate doc comment for why it's
 * always the resulting absolute value rather than a delta), then for every
 * update that reaches or exceeds its instance's target, attempts to insert a
 * ChallengeCompletion row. That insert's own (instance_id, steam_id) primary
 * key is what makes completion idempotent: reaching the target again on a
 * later poll, or the same triggering GameEvent being reprocessed, can never
 * insert a second row, so only genuinely-new completions are returned -
 * mirroring applyAchievementUnlockDrafts' own idempotency role for
 * Achievement unlocks.
 */
async function applyChallengeProgressUpdates(
  tx: Tx,
  updates: ChallengeProgressUpdate[],
): Promise<ChallengeCompletionResult[]> {
  const completions: ChallengeCompletionResult[] = [];

  for (const update of updates) {
    await tx
      .insert(playerChallengeProgress)
      .values({ instanceId: update.instanceId, steamId: update.steamId, progress: update.progress })
      .onConflictDoUpdate({
        target: [playerChallengeProgress.instanceId, playerChallengeProgress.steamId],
        set: { progress: update.progress },
      });

    if (update.progress < update.target) {
      continue;
    }

    const [completed] = await tx
      .insert(challengeCompletions)
      .values({ instanceId: update.instanceId, steamId: update.steamId })
      .onConflictDoNothing({ target: [challengeCompletions.instanceId, challengeCompletions.steamId] })
      .returning({ instanceId: challengeCompletions.instanceId, steamId: challengeCompletions.steamId });

    if (completed) {
      completions.push({
        instanceId: update.instanceId,
        steamId: update.steamId,
        eventId: update.eventId,
        xpReward: update.xpReward,
      });
    }
  }

  return completions;
}

/**
 * Gathers the extra per-Match/per-player state computeAchievementUnlockDrafts
 * needs beyond the recorded events themselves: the current
 * ACHIEVEMENT_DEFINITIONS config, each relevant player's total ever/
 * within-Match PlayerKilled counts (for first_kill/match_kills), and - for a
 * Match this same batch closed - its participants' resulting
 * matchesPlayed/matchesWon/per-Match deaths (for matches_played/matches_won/
 * survivor). Queried fresh every call rather than cached, matching
 * buildXpTransactionContext's own precedent.
 */
async function buildAchievementContext(
  tx: Tx,
  serverId: number,
  recordedEvents: RecordedGameEvent[],
  closedMatch: { id: number } | undefined,
): Promise<AchievementContext> {
  const definitionRows = await tx.select().from(achievementDefinitions);
  const definitions: AchievementDefinitionConfig[] = definitionRows.map((row) => ({
    id: row.id,
    trigger: row.trigger,
    threshold: row.threshold,
  }));

  const killSteamIds = [
    ...new Set(
      recordedEvents
        .filter((event): event is RecordedGameEvent & { steamId: string } => event.type === "PlayerKilled" && event.steamId != null)
        .map((event) => event.steamId),
    ),
  ];
  const totalKillsBySteamId = new Map<string, number>();
  if (killSteamIds.length > 0) {
    const rows = await tx
      .select({ steamId: gameEvents.steamId, count: sql<number>`COUNT(*)` })
      .from(gameEvents)
      .where(
        and(
          eq(gameEvents.serverId, serverId),
          eq(gameEvents.type, "PlayerKilled" satisfies GameEventType),
          inArray(gameEvents.steamId, killSteamIds),
        ),
      )
      .groupBy(gameEvents.steamId);
    for (const row of rows) {
      if (row.steamId) {
        totalKillsBySteamId.set(row.steamId, Number(row.count));
      }
    }
  }

  const killMatchIds = [...new Set(
    recordedEvents.filter((event) => event.type === "PlayerKilled").map((event) => event.matchId),
  )];
  const matchKillsByPlayerMatch = new Map<string, number>();
  for (const matchId of killMatchIds) {
    const rows = await tx
      .select({ steamId: gameEvents.steamId, count: sql<number>`COUNT(*)` })
      .from(gameEvents)
      .where(and(eq(gameEvents.matchId, matchId), eq(gameEvents.type, "PlayerKilled" satisfies GameEventType)))
      .groupBy(gameEvents.steamId);
    for (const row of rows) {
      if (row.steamId) {
        matchKillsByPlayerMatch.set(`${matchId}:${row.steamId}`, Number(row.count));
      }
    }
  }

  const matchCompletions: AchievementContext["matchCompletions"] = new Map();
  const hasMatchEnded = recordedEvents.some((event) => event.type === "MatchEnded");
  if (hasMatchEnded && closedMatch) {
    const matchStatRows = await tx
      .select({ steamId: playerMatchStats.steamId, deaths: playerMatchStats.deaths })
      .from(playerMatchStats)
      .where(eq(playerMatchStats.matchId, closedMatch.id));

    const participantSteamIds = matchStatRows.map((row) => row.steamId);
    const careerRows =
      participantSteamIds.length > 0
        ? await tx
            .select({
              steamId: playerCareerStats.steamId,
              matchesPlayed: playerCareerStats.matchesPlayed,
              matchesWon: playerCareerStats.matchesWon,
            })
            .from(playerCareerStats)
            .where(
              and(eq(playerCareerStats.serverId, serverId), inArray(playerCareerStats.steamId, participantSteamIds)),
            )
        : [];
    const careerBySteamId = new Map(careerRows.map((row) => [row.steamId, row]));

    const participants = matchStatRows.map((stat) => {
      const career = careerBySteamId.get(stat.steamId);
      return {
        steamId: stat.steamId,
        deathsInMatch: stat.deaths,
        matchesPlayed: career?.matchesPlayed ?? 0,
        matchesWon: career?.matchesWon ?? 0,
      };
    });
    matchCompletions.set(closedMatch.id, { participants });
  }

  return { serverId, definitions, totalKillsBySteamId, matchKillsByPlayerMatch, matchCompletions };
}

/**
 * Persists a batch of AchievementUnlockDrafts to playerAchievements and
 * returns only the rows actually inserted. The insert's (server_id,
 * steam_id, achievement_id) uniqueness is what makes an unlock idempotent:
 * persisting the same draft twice (e.g. a recurring qualifying condition, or
 * a reprocessed GameEvent) inserts nothing the second time, via
 * onConflictDoNothing, so an AchievementUnlocked GameEvent - built only from
 * this function's return value, never from the drafts themselves - fires at
 * most once per player per Achievement per Server, matching
 * applyXpTransactionDrafts' own idempotency role for the XP ledger.
 */
export async function applyAchievementUnlockDrafts(
  tx: Tx,
  drafts: AchievementUnlockDraft[],
): Promise<RecordedAchievementUnlock[]> {
  if (drafts.length === 0) {
    return [];
  }

  return tx
    .insert(playerAchievements)
    .values(
      drafts.map((draft) => ({
        serverId: draft.serverId,
        steamId: draft.steamId,
        achievementId: draft.achievementId,
      })),
    )
    .onConflictDoNothing({
      target: [playerAchievements.serverId, playerAchievements.steamId, playerAchievements.achievementId],
    })
    .returning({ steamId: playerAchievements.steamId, achievementId: playerAchievements.achievementId });
}

/**
 * Computes this poll's AchievementUnlocked GameEvent drafts end to end:
 * gathers the Achievement Engine's context, diffs it against `recordedEvents`
 * for qualifying unlocks, persists the genuinely-new ones to
 * playerAchievements, and builds one AchievementUnlocked draft per row
 * actually inserted. Returns drafts (not yet inserted into gameEvents) so the
 * caller can run them through the same insertGameEventDrafts/dedupe path as
 * every other GameEvent batch.
 */
async function computeAchievementUnlockEventDrafts(
  tx: Tx,
  serverId: number,
  recordedEvents: RecordedGameEvent[],
  closedMatch: { id: number } | undefined,
  context: GameEventContext,
): Promise<GameEventDraft[]> {
  const achievementContext = await buildAchievementContext(tx, serverId, recordedEvents, closedMatch);
  const drafts = computeAchievementUnlockDrafts(recordedEvents, achievementContext);
  const unlocked = await applyAchievementUnlockDrafts(tx, drafts);
  return achievementUnlockedEvents(unlocked, context);
}

/**
 * For every steamId in `steamIds` (the players who just received new XP this
 * poll - see ingestSnapshot's recordedXpTransactions), checks whether their
 * resulting cached playerCareerStats.xp now maps to a higher level (per
 * level_thresholds) than what's currently persisted in that row's `level`
 * column, and if so persists the new level and returns one PlayerLevelUp
 * GameEvent draft per level gained (see level-engine.ts's levelUpEvents) - so
 * a single award crossing two thresholds at once still emits one event per
 * level, not one for the whole jump. Reads the pre-update `level` column as
 * each crossing's baseline rather than recomputing it from a "previous xp"
 * value, since that column is kept in sync with xp after every prior award
 * (this function's own postcondition) - so it's always already correct going
 * into this call. `context.matchId` attributes every resulting draft to
 * whichever Match is open at the moment this batch is processed - level is a
 * Server-scoped total, not a Match-scoped one, so the required `matchId`
 * column just needs *a* value (see level-engine.ts's own doc comment).
 */
async function applyLevelUps(
  tx: Tx,
  context: GameEventContext,
  steamIds: string[],
): Promise<GameEventDraft[]> {
  if (steamIds.length === 0) {
    return [];
  }

  const thresholds = await tx.select().from(levelThresholds);
  const careerRows = await tx
    .select({ steamId: playerCareerStats.steamId, xp: playerCareerStats.xp, level: playerCareerStats.level })
    .from(playerCareerStats)
    .where(and(eq(playerCareerStats.serverId, context.serverId), inArray(playerCareerStats.steamId, steamIds)));

  const drafts: GameEventDraft[] = [];
  for (const row of careerRows) {
    const newLevel = levelForXp(row.xp, thresholds);
    if (newLevel === row.level) {
      continue;
    }

    await tx
      .update(playerCareerStats)
      .set({ level: newLevel })
      .where(and(eq(playerCareerStats.serverId, context.serverId), eq(playerCareerStats.steamId, row.steamId)));

    drafts.push(...levelUpEvents(row.steamId, row.level, newLevel, context));
  }

  return drafts;
}

/**
 * Gathers the extra state computeNotificationDrafts needs beyond the
 * recorded events/Challenge completions themselves: the current
 * NOTIFICATION_RULES config, the display name of every Achievement this
 * batch's AchievementUnlocked events actually unlocked, the playerCareerStats
 * display name of every steamId this batch's drafts might name (for the
 * {{playerName}} template var - falls back to the raw steamId in
 * notification-engine.ts when a player has no career stats row yet), and -
 * when this poll opened and/or closed a Match - that Match's map/winning
 * Faction, for the MatchStarted/MatchEnded templates. Queried fresh every
 * call rather than cached, matching buildXpTransactionContext's own
 * precedent.
 */
async function buildNotificationContext(
  tx: Tx,
  serverId: number,
  timestamp: Date,
  recordedEvents: RecordedGameEvent[],
  challengeCompletionInfos: ChallengeCompletionNotificationInfo[],
  openedMatch: { map: string } | undefined,
  closedMatch: { winner: string | null } | undefined,
): Promise<NotificationContext> {
  const ruleRows = await tx.select().from(notificationRules);
  const rules = new Map<NotificationKind, NotificationRuleConfig>(
    ruleRows.map((row) => [row.kind, { priority: row.priority, template: row.template }]),
  );

  const achievementIds = [
    ...new Set(
      recordedEvents
        .filter((event) => event.type === "AchievementUnlocked")
        .map((event) => event.metadata?.achievementId)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  const achievementNameById = new Map<string, string>();
  if (achievementIds.length > 0) {
    const rows = await tx
      .select({ id: achievementDefinitions.id, name: achievementDefinitions.name })
      .from(achievementDefinitions)
      .where(inArray(achievementDefinitions.id, achievementIds));
    for (const row of rows) {
      achievementNameById.set(row.id, row.name);
    }
  }

  const notifiedSteamIds = [
    ...new Set(
      [
        ...recordedEvents.map((event) => event.steamId).filter((steamId): steamId is string => steamId != null),
        ...challengeCompletionInfos.map((completion) => completion.steamId),
      ],
    ),
  ];
  const playerNameBySteamId = new Map<string, string>();
  if (notifiedSteamIds.length > 0) {
    const rows = await tx
      .select({ steamId: playerCareerStats.steamId, displayName: playerCareerStats.displayName })
      .from(playerCareerStats)
      .where(and(eq(playerCareerStats.serverId, serverId), inArray(playerCareerStats.steamId, notifiedSteamIds)));
    for (const row of rows) {
      playerNameBySteamId.set(row.steamId, row.displayName);
    }
  }

  return {
    serverId,
    timestamp,
    rules,
    achievementNameById,
    playerNameBySteamId,
    openedMatchMap: openedMatch?.map,
    closedMatchWinner: closedMatch?.winner,
  };
}

/**
 * Looks up each completed daily Challenge's own type (challenge-engine.ts's
 * ChallengeType), for the ChallengeCompleted Notification template - see
 * notification-engine.ts's ChallengeCompletionNotificationInfo. A Challenge
 * completion carries no GameEventType of its own (see notification.ts), so
 * this is gathered independently of buildNotificationContext's recordedEvents
 * diff.
 */
async function buildChallengeCompletionNotificationInfo(
  tx: Tx,
  completions: ChallengeCompletionResult[],
): Promise<ChallengeCompletionNotificationInfo[]> {
  if (completions.length === 0) {
    return [];
  }

  const instanceIds = [...new Set(completions.map((completion) => completion.instanceId))];
  const rows = await tx
    .select({ instanceId: challengeInstances.id, type: challengeDefinitions.type })
    .from(challengeInstances)
    .innerJoin(challengeDefinitions, eq(challengeInstances.definitionId, challengeDefinitions.id))
    .where(inArray(challengeInstances.id, instanceIds));
  const typeByInstanceId = new Map(rows.map((row) => [row.instanceId, row.type]));

  return completions.map((completion) => ({
    steamId: completion.steamId,
    eventId: completion.eventId,
    challengeType: typeByInstanceId.get(completion.instanceId) ?? "unknown",
  }));
}

/**
 * The current NOTIFICATION_SETTINGS cap plus this Server's low/normal
 * Notification count already recorded within the trailing 60s window ending
 * at `timestamp` - everything applyNotificationThrottle needs beyond the
 * batch's own drafts. The window is driven by `timestamp` (the originating
 * poll's capturedAt), not wall-clock time, matching every Notification's own
 * `timestamp` column - see schema.ts's notifications doc comment.
 */
async function fetchNotificationThrottleState(
  tx: Tx,
  serverId: number,
  timestamp: Date,
): Promise<{ maxPerMinute: number; recentLowNormalCount: number }> {
  const [settings] = await tx.select().from(notificationSettings).where(eq(notificationSettings.id, 1));
  const maxPerMinute = settings?.maxLowNormalPerMinute ?? 0;

  const windowStart = new Date(timestamp.getTime() - 60_000);
  const [row] = await tx
    .select({ count: sql<number>`COUNT(*)` })
    .from(notifications)
    .where(
      and(
        eq(notifications.serverId, serverId),
        inArray(notifications.priority, ["low", "normal"]),
        gt(notifications.timestamp, windowStart),
        lte(notifications.timestamp, timestamp),
      ),
    );

  return { maxPerMinute, recentLowNormalCount: Number(row?.count ?? 0) };
}

/**
 * Persists a batch of NotificationDrafts (already throttled by the caller
 * via applyNotificationThrottle) to the notifications table - see schema.ts's
 * notifications doc comment for why no dedupe guard is needed here.
 */
async function applyNotificationDrafts(tx: Tx, drafts: NotificationDraft[]): Promise<void> {
  if (drafts.length === 0) {
    return;
  }
  await tx.insert(notifications).values(drafts);
}

/**
 * Ingests one freshly-polled Snapshot for a Server: detects whether it
 * starts a new Match (comparing it to the Server's last-persisted
 * Snapshot), closing and rolling up the previous Match if so, then
 * persists the Snapshot both as the Server's latest state and, scoped to
 * whichever Match is now open, as raw history for that Match's eventual
 * close.
 *
 * A gap in polling needs no special handling: the "previous Snapshot" is
 * always whatever was last persisted, regardless of how long ago that was,
 * so a stale state on resume is detected as an ordinary boundary and the
 * stale Match is closed using that last-known-good Snapshot's timestamp.
 *
 * Also diffs the previous roster against this Snapshot's to emit
 * PlayerJoined/PlayerLeft GameEvents (see game-events.ts), attributed to
 * whichever Match is open by the time the diff runs - the newly-opened one,
 * if this same Snapshot also happened to start one. A MatchEnded/MatchStarted
 * pair is emitted whenever this Snapshot closes and/or opens a Match, each
 * carrying its own Match's id. PlayerKilled/PlayerDeath are emitted from
 * kill/death counter deltas, but only when this Snapshot did *not* cross a
 * Match boundary - a boundary's counter reset must never be misread as a
 * batch of deaths (see diffKillDeathGameEvents). FactionScoreChanged and
 * FactionTookLead are emitted under the same non-boundary guard, diffing
 * Faction scores against the previous Snapshot and against whichever
 * Faction this Match's most recent FactionTookLead event named as leader
 * (a fresh query, not just the previous Snapshot's scores - see
 * diffFactionScoreGameEvents for why a tie must not reset that state).
 * PlayerKillStreakStarted/Increased/Broken are emitted under the same guard,
 * diffing kill/death counters against each player's currentKillStreak as
 * last persisted to playerCareerStats (durable, not worker memory, so a
 * worker restart mid-Match never loses an in-progress streak) - see
 * diffKillStreakGameEvents. Whenever this Snapshot opens a new Match, every
 * player's currentKillStreak on this Server is reset to 0 first, regardless
 * of how their previous Match ended (see spec.md's Domain Decisions).
 * Duplicate drafts (e.g. from a retried write of the same transition) are
 * silently dropped via their idempotencyKey unique constraint rather than
 * erroring.
 *
 * Whenever this batch's GameEvents earn XP (via computeXpTransactionDrafts/
 * applyXpTransactionDrafts), every player who actually gained XP is then
 * checked against the level curve - see applyLevelUps - and a PlayerLevelUp
 * GameEvent is emitted per level gained, persisted in a second insert into
 * gameEvents once the resulting playerCareerStats.xp is known.
 *
 * This same batch of recordedEvents is also diffed against the
 * ACHIEVEMENT_DEFINITIONS config (see computeAchievementUnlockEventDrafts/
 * achievement-engine.ts's computeAchievementUnlockDrafts): a qualifying
 * PlayerKilled, PlayerKillStreakStarted/Increased, or MatchEnded event writes
 * a PlayerAchievement row at most once per player per Achievement per
 * Server, and an AchievementUnlocked GameEvent is emitted only for a row
 * genuinely new to that insert - never for a recurring condition or a
 * reprocessed event, both of which the insert's own uniqueness turns into a
 * no-op.
 *
 * Every poll also ensures today's daily ChallengeInstances exist (see
 * ensureDailyChallengeInstances), then diffs this same batch of
 * recordedEvents against them (see buildChallengeProgressContext/
 * challenge-engine.ts's computeChallengeProgressUpdates) to update each
 * affected player's PlayerChallengeProgress. A player whose progress reaches
 * an instance's target completes it via a ChallengeCompletion row - at most
 * once per player per instance, mirroring PlayerAchievement's own
 * idempotency - and is awarded that instance's configured XP through the
 * same xp_transactions ledger as every other XP reason (see
 * applyXpTransactionDrafts), reason "challenge_completed".
 *
 * Finally, this same batch of recordedEvents (achievement unlocks and level
 * ups included) plus this poll's Challenge completions are diffed against
 * the NOTIFICATION_RULES config (see buildNotificationContext/
 * notification-engine.ts's computeNotificationDrafts) into Notification
 * drafts - MatchStarted/MatchEnded/AchievementUnlocked/a 10+ kill streak/a
 * Challenge completion always produce one; routine events (an individual
 * kill, a small XP gain) never do, structurally rather than via throttling
 * (ticket 10). The configured NOTIFICATION_SETTINGS max-per-minute cap (see
 * fetchNotificationThrottleState/applyNotificationThrottle) then suppresses
 * excess low/normal-priority drafts - high-priority ones are never dropped.
 *
 * Logs a line for each Match opened and/or closed, and each GameEvent
 * actually inserted - the things a poll can meaningfully change from an
 * operator's point of view, versus the ~15s poll cadence itself which is too
 * frequent to log on every tick. Logged only after the transaction below
 * actually commits, so a rolled-back attempt never gets reported as having
 * happened.
 */
export async function ingestSnapshot(
  db: Database,
  serverId: number,
  snapshot: Snapshot,
  capturedAt: Date,
): Promise<void> {
  let closedMatch: (MatchCloseSummary & { id: number; endedAt: Date }) | undefined;
  let openedMatch: { id: number; map: string } | undefined;
  let recordedEvents: RecordedGameEvent[] = [];
  let recordedXpTransactions: XpTransactionDraft[] = [];
  let challengeCompletionResults: ChallengeCompletionResult[] = [];
  let recordedNotifications: NotificationDraft[] = [];

  await db.transaction(async (tx) => {
    const [previousRow] = await tx
      .select()
      .from(latestSnapshots)
      .where(eq(latestSnapshots.serverId, serverId))
      .limit(1);

    const [openMatch] = await tx
      .select()
      .from(matches)
      .where(and(eq(matches.serverId, serverId), isNull(matches.endedAt)))
      .limit(1);

    // Generating today's daily ChallengeInstances doesn't depend on anything
    // else this poll computes, and is safe to attempt on every poll (see
    // ensureDailyChallengeInstances) - done up front so periodKey is ready
    // for the progress-tracking step below regardless of whether this poll
    // also crosses a Match boundary.
    const periodKey = dailyPeriodKey(capturedAt);
    await ensureDailyChallengeInstances(tx, serverId, periodKey);

    const isBoundary =
      !previousRow || detectMatchBoundary(previousRow.payload, snapshot);

    let currentMatchId: number;

    if (isBoundary) {
      if (openMatch && previousRow) {
        const summary = await closeMatch(tx, openMatch, previousRow.capturedAt);
        closedMatch = { id: openMatch.id, endedAt: previousRow.capturedAt, ...summary };
      }
      const [newMatch] = await tx
        .insert(matches)
        .values({
          serverId,
          map: snapshot.map,
          experiences: snapshot.experiences,
          startedAt: capturedAt,
        })
        .returning();
      currentMatchId = newMatch.id;
      openedMatch = { id: newMatch.id, map: newMatch.map };

      // Kill streaks are Match-scoped: every player on this Server resets to
      // 0 the moment a new Match opens, regardless of how their previous
      // Match ended (see spec.md's Domain Decisions and CONTEXT.md's
      // KillStreak entry).
      await tx
        .update(playerCareerStats)
        .set({ currentKillStreak: 0 })
        .where(eq(playerCareerStats.serverId, serverId));
    } else {
      currentMatchId = openMatch!.id;
    }

    const [insertedSnapshot] = await tx
      .insert(matchSnapshots)
      .values({
        matchId: currentMatchId,
        capturedAt,
        payload: snapshot,
      })
      .returning();

    const eventDrafts = diffRosterGameEvents(previousRow?.payload.players, snapshot.players, {
      serverId,
      matchId: currentMatchId,
      timestamp: capturedAt,
      sourceSnapshotId: insertedSnapshot.id,
    });

    if (closedMatch) {
      eventDrafts.push(
        matchLifecycleEvent("MatchEnded", {
          serverId,
          matchId: closedMatch.id,
          timestamp: closedMatch.endedAt,
          sourceSnapshotId: insertedSnapshot.id,
        }),
      );
    }
    if (openedMatch) {
      eventDrafts.push(
        matchLifecycleEvent("MatchStarted", {
          serverId,
          matchId: openedMatch.id,
          timestamp: capturedAt,
          sourceSnapshotId: insertedSnapshot.id,
        }),
      );
    }
    if (!isBoundary && previousRow) {
      eventDrafts.push(
        ...diffKillDeathGameEvents(previousRow.payload.players, snapshot.players, {
          serverId,
          matchId: currentMatchId,
          timestamp: capturedAt,
          sourceSnapshotId: insertedSnapshot.id,
        }),
      );

      const [lastLeaderEvent] = await tx
        .select({ faction: gameEvents.faction })
        .from(gameEvents)
        .where(and(eq(gameEvents.matchId, currentMatchId), eq(gameEvents.type, "FactionTookLead")))
        .orderBy(desc(gameEvents.id))
        .limit(1);

      // Falls back to the previous Snapshot's own sole leader (not null)
      // when this Match has no FactionTookLead row yet - covers a Match
      // whose boundary Snapshot already showed a non-tied score spread,
      // so that pre-existing leader isn't misreported as "taking" a lead
      // it already held. See soleLeader's doc comment.
      const previousLeader = lastLeaderEvent?.faction ?? soleLeader(previousRow.payload.factions)?.name ?? null;

      eventDrafts.push(
        ...diffFactionScoreGameEvents(previousRow.payload.factions, snapshot.factions, previousLeader, {
          serverId,
          matchId: currentMatchId,
          timestamp: capturedAt,
          sourceSnapshotId: insertedSnapshot.id,
        }),
      );

      const steamIds = snapshot.players.map((player) => player.steamId);
      const streakRows =
        steamIds.length > 0
          ? await tx
              .select({ steamId: playerCareerStats.steamId, currentKillStreak: playerCareerStats.currentKillStreak })
              .from(playerCareerStats)
              .where(and(eq(playerCareerStats.serverId, serverId), inArray(playerCareerStats.steamId, steamIds)))
          : [];
      const currentStreaks = new Map(streakRows.map((row) => [row.steamId, row.currentKillStreak]));

      const killStreakDiff = diffKillStreakGameEvents(previousRow.payload.players, snapshot.players, currentStreaks, {
        serverId,
        matchId: currentMatchId,
        timestamp: capturedAt,
        sourceSnapshotId: insertedSnapshot.id,
      });
      eventDrafts.push(...killStreakDiff.events);
      await applyKillStreakUpdates(tx, serverId, killStreakDiff.updates);
    }

    recordedEvents = await insertGameEventDrafts(tx, eventDrafts);

    if (recordedEvents.length > 0) {
      const xpTransactionContext = await buildXpTransactionContext(tx, serverId, recordedEvents, closedMatch);
      const xpTransactionDrafts = computeXpTransactionDrafts(recordedEvents, xpTransactionContext);
      recordedXpTransactions = await applyXpTransactionDrafts(tx, xpTransactionDrafts);

      const achievementEventDrafts = await computeAchievementUnlockEventDrafts(tx, serverId, recordedEvents, closedMatch, {
        serverId,
        matchId: currentMatchId,
        timestamp: capturedAt,
        sourceSnapshotId: insertedSnapshot.id,
      });
      const recordedAchievementUnlocks = await insertGameEventDrafts(tx, achievementEventDrafts);
      recordedEvents = recordedEvents.concat(recordedAchievementUnlocks);

      const challengeProgressContext = await buildChallengeProgressContext(
        tx,
        periodKey,
        serverId,
        recordedEvents,
        xpTransactionContext.matchCompletions,
      );
      const challengeProgressUpdates = computeChallengeProgressUpdates(recordedEvents, challengeProgressContext);
      challengeCompletionResults = await applyChallengeProgressUpdates(tx, challengeProgressUpdates);

      if (challengeCompletionResults.length > 0) {
        const challengeXpDrafts: XpTransactionDraft[] = challengeCompletionResults.map((completion) => ({
          serverId,
          steamId: completion.steamId,
          amount: completion.xpReward,
          reason: "challenge_completed",
          eventId: completion.eventId,
          challengeInstanceId: completion.instanceId,
        }));
        const recordedChallengeXp = await applyXpTransactionDrafts(tx, challengeXpDrafts);
        recordedXpTransactions = recordedXpTransactions.concat(recordedChallengeXp);
      }
    }

    if (recordedXpTransactions.length > 0) {
      const gainedSteamIds = [...new Set(recordedXpTransactions.map((transaction) => transaction.steamId))];
      const levelUpDrafts = await applyLevelUps(
        tx,
        { serverId, matchId: currentMatchId, timestamp: capturedAt, sourceSnapshotId: insertedSnapshot.id },
        gainedSteamIds,
      );

      const recordedLevelUps = await insertGameEventDrafts(tx, levelUpDrafts);
      recordedEvents = recordedEvents.concat(recordedLevelUps);
    }

    if (recordedEvents.length > 0 || challengeCompletionResults.length > 0) {
      const challengeCompletionInfos = await buildChallengeCompletionNotificationInfo(tx, challengeCompletionResults);
      const notificationContext = await buildNotificationContext(
        tx,
        serverId,
        capturedAt,
        recordedEvents,
        challengeCompletionInfos,
        openedMatch,
        closedMatch,
      );
      const notificationDrafts = computeNotificationDrafts(recordedEvents, challengeCompletionInfos, notificationContext);

      if (notificationDrafts.length > 0) {
        const { maxPerMinute, recentLowNormalCount } = await fetchNotificationThrottleState(tx, serverId, capturedAt);
        recordedNotifications = applyNotificationThrottle(notificationDrafts, recentLowNormalCount, maxPerMinute);
        await applyNotificationDrafts(tx, recordedNotifications);
      }
    }

    await tx
      .insert(latestSnapshots)
      .values({ serverId, capturedAt, payload: snapshot })
      .onConflictDoUpdate({
        target: latestSnapshots.serverId,
        set: { capturedAt, payload: snapshot },
      });
  });

  if (closedMatch) {
    console.log(
      `[worker] match closed: matchId=${closedMatch.id}, winner=${closedMatch.winner ?? "none"}, mvp=${closedMatch.mvpPlayerSteamId ?? "none"}, ${closedMatch.playerCount} player(s)`,
    );
  }
  if (openedMatch) {
    console.log(`[worker] match started: matchId=${openedMatch.id}, map=${openedMatch.map}`);
  }
  for (const event of recordedEvents) {
    const steamIdPart = event.steamId ? `, steamId=${event.steamId}` : "";
    console.log(
      `[worker] game event: type=${event.type}, serverId=${serverId}, matchId=${event.matchId}${steamIdPart}, eventId=${event.id}`,
    );
  }
  for (const transaction of recordedXpTransactions) {
    console.log(
      `[worker] xp transaction: reason=${transaction.reason}, amount=${transaction.amount}, serverId=${serverId}, steamId=${transaction.steamId}, eventId=${transaction.eventId}`,
    );
  }
  for (const notification of recordedNotifications) {
    console.log(
      `[worker] notification: priority=${notification.priority}, serverId=${serverId}, eventId=${notification.eventId}, message=${notification.message}`,
    );
  }
}
