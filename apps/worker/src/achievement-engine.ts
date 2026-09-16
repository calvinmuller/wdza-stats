import type { AchievementTrigger } from "@wdza-stats/db";
import { buildIdempotencyKey, type GameEventContext, type GameEventDraft } from "./game-events";
import type { RecordedGameEvent } from "./xp-engine";

/** One row of the ACHIEVEMENT_DEFINITIONS config table - see CONTEXT.md's Achievement entry and ticket 08. */
export interface AchievementDefinitionConfig {
  id: string;
  trigger: AchievementTrigger;
  threshold: number;
}

export interface AchievementUnlockDraft {
  serverId: number;
  steamId: string;
  achievementId: string;
  eventId: number;
}

/** One closed Match's per-participant state the "matches_played"/"matches_won"/"survivor" triggers need - gathered by the caller from playerCareerStats (post-increment) and playerMatchStats. "survivor" also requires presentAtStart, so a late joiner's trivial 0/0 kills/deaths delta doesn't unlock it. */
export interface MatchCompletionAchievementInfo {
  participants: {
    steamId: string;
    matchesPlayed: number;
    matchesWon: number;
    deathsInMatch: number;
    // Whether this participant was already present for the Match's very
    // first Snapshot, rather than joining partway through - see
    // computePlayerDeltas' presentAtStart doc comment in match-tracker.ts.
    // "survivor" requires this so a player who joins moments before
    // MatchEnded (a trivial 0/0 kills/deaths delta) doesn't unlock it.
    presentAtStart: boolean;
  }[];
}

/** Everything computeAchievementUnlockDrafts needs beyond the events themselves, gathered by the caller so the diff stays pure. */
export interface AchievementContext {
  serverId: number;
  // The ACHIEVEMENT_DEFINITIONS config table, read fresh each call so
  // Achievements can be added/retuned without a deploy - see xp-engine.ts's
  // xpRewards for the same convention.
  definitions: AchievementDefinitionConfig[];
  // GameEvent id -> that PlayerKilled event's 1-indexed ordinal among every
  // PlayerKilled event recorded in its own Match (across every player, not
  // just the scorer) - so "first_kill"'s threshold means "whoever lands the
  // Match's Nth kill", matching what "First Blood" (threshold 1) actually
  // means: the game's opening kill, not any one player's own first-ever
  // kill. Only carries entries for events this batch could plausibly match
  // a first_kill definition against.
  matchKillOrdinalByEventId: Map<number, number>;
  // `${matchId}:${steamId}` -> that player's PlayerKilled count within that
  // one Match, as of after this batch's own PlayerKilled events were
  // persisted.
  matchKillsByPlayerMatch: Map<string, number>;
  // matchId -> per-participant stats for a Match this same batch closed -
  // present only for a MatchEnded event whose Match this batch actually
  // closed, mirroring XpTransactionContext.matchCompletions.
  matchCompletions: Map<number, MatchCompletionAchievementInfo>;
}

function definitionsFor(trigger: AchievementTrigger, context: AchievementContext): AchievementDefinitionConfig[] {
  return context.definitions.filter((definition) => definition.trigger === trigger);
}

function unlockDraft(
  context: AchievementContext,
  steamId: string,
  definition: AchievementDefinitionConfig,
  eventId: number,
): AchievementUnlockDraft {
  return { serverId: context.serverId, steamId, achievementId: definition.id, eventId };
}

function firstKillDrafts(event: RecordedGameEvent, context: AchievementContext): AchievementUnlockDraft[] {
  if (!event.steamId) {
    return [];
  }
  const ordinal = context.matchKillOrdinalByEventId.get(event.id);
  if (ordinal === undefined) {
    return [];
  }
  return definitionsFor("first_kill", context)
    .filter((definition) => ordinal === definition.threshold)
    .map((definition) => unlockDraft(context, event.steamId!, definition, event.id));
}

function killStreakDrafts(event: RecordedGameEvent, context: AchievementContext): AchievementUnlockDraft[] {
  const streak = event.metadata?.streak;
  if (!event.steamId || typeof streak !== "number") {
    return [];
  }
  return definitionsFor("kill_streak", context)
    .filter((definition) => streak === definition.threshold)
    .map((definition) => unlockDraft(context, event.steamId!, definition, event.id));
}

function matchKillsDrafts(event: RecordedGameEvent, context: AchievementContext): AchievementUnlockDraft[] {
  if (!event.steamId) {
    return [];
  }
  const matchKills = context.matchKillsByPlayerMatch.get(`${event.matchId}:${event.steamId}`) ?? 0;
  return definitionsFor("match_kills", context)
    .filter((definition) => matchKills === definition.threshold)
    .map((definition) => unlockDraft(context, event.steamId!, definition, event.id));
}

function matchCompletionDrafts(event: RecordedGameEvent, context: AchievementContext): AchievementUnlockDraft[] {
  const completion = context.matchCompletions.get(event.matchId);
  if (!completion) {
    return [];
  }

  return completion.participants.flatMap((participant) => {
    const drafts: AchievementUnlockDraft[] = [];

    for (const definition of definitionsFor("matches_played", context)) {
      if (participant.matchesPlayed === definition.threshold) {
        drafts.push(unlockDraft(context, participant.steamId, definition, event.id));
      }
    }
    for (const definition of definitionsFor("matches_won", context)) {
      if (participant.matchesWon === definition.threshold) {
        drafts.push(unlockDraft(context, participant.steamId, definition, event.id));
      }
    }
    for (const definition of definitionsFor("survivor", context)) {
      if (participant.presentAtStart && participant.deathsInMatch === definition.threshold) {
        drafts.push(unlockDraft(context, participant.steamId, definition, event.id));
      }
    }

    return drafts;
  });
}

/**
 * The Achievement Engine's unlock diff: computes every AchievementUnlockDraft
 * a batch of freshly-recorded GameEvents should produce, given the current
 * ACHIEVEMENT_DEFINITIONS config and the extra per-Match/per-player state
 * (kill totals, closed-Match participant rollups) the caller gathered from
 * the database. Pure - the caller (match-tracker.ts) is responsible for
 * persisting the result via an insert guarded by playerAchievements'
 * (server_id, steam_id, achievement_id) uniqueness, which is what actually
 * makes an unlock idempotent under a recurring condition or a reprocessed
 * event; this function itself has no memory of what's already been unlocked,
 * so e.g. a "matches_won" definition keeps producing a draft every Match a
 * player wins from the 25th onward - the insert's uniqueness is what turns
 * that into a no-op past the first.
 */
export function computeAchievementUnlockDrafts(
  events: RecordedGameEvent[],
  context: AchievementContext,
): AchievementUnlockDraft[] {
  return events.flatMap((event) => {
    switch (event.type) {
      case "PlayerKilled":
        return [...firstKillDrafts(event, context), ...matchKillsDrafts(event, context)];
      case "PlayerKillStreakStarted":
      case "PlayerKillStreakIncreased":
        return killStreakDrafts(event, context);
      case "MatchEnded":
        return matchCompletionDrafts(event, context);
      default:
        return [];
    }
  });
}

/** One actually-persisted PlayerAchievement row, from match-tracker.ts's applyAchievementUnlockDrafts insert-and-return. */
export interface RecordedAchievementUnlock {
  steamId: string;
  achievementId: string;
}

/**
 * One `AchievementUnlocked` draft per actually-persisted PlayerAchievement
 * row - never built directly from computeAchievementUnlockDrafts' own output,
 * since that output isn't yet known to have been a genuinely new unlock (see
 * this file's own doc comment above). `context.matchId` is whichever Match
 * is open at the moment this batch is processed, matching level-engine.ts's
 * levelUpEvents - an Achievement unlock is Server-scoped, not Match-scoped,
 * so the required `matchId` column just needs *a* value.
 */
export function achievementUnlockedEvents(
  unlocks: RecordedAchievementUnlock[],
  context: GameEventContext,
): GameEventDraft[] {
  return unlocks.map((unlock) => ({
    serverId: context.serverId,
    matchId: context.matchId,
    type: "AchievementUnlocked",
    timestamp: context.timestamp,
    steamId: unlock.steamId,
    targetSteamId: null,
    faction: null,
    metadata: { achievementId: unlock.achievementId },
    sourceSnapshotId: context.sourceSnapshotId,
    idempotencyKey: buildIdempotencyKey(context, "AchievementUnlocked", unlock.steamId, unlock.achievementId),
  }));
}
