import type { GameEventType, XpReason } from "@wdza-stats/db";

/** The slice of a persisted GameEvent the Progression Engine needs to compute XpTransaction drafts from - see ingestSnapshot's `recordedEvents`. */
export interface RecordedGameEvent {
  id: number;
  type: GameEventType;
  steamId: string | null;
  matchId: number;
  metadata: Record<string, unknown> | null;
}

export interface XpTransactionDraft {
  serverId: number;
  steamId: string;
  amount: number;
  reason: XpReason;
  eventId: number;
  // Set only for reason "challenge_completed" - see schema.ts's
  // xpTransactions doc comment for why it's part of that reason's own
  // idempotency key rather than left implicit.
  challengeInstanceId?: number;
}

export interface MatchCompletionInfo {
  winningFaction: string | null;
  participants: { steamId: string; faction: string }[];
}

/** Everything computeXpTransactionDrafts needs beyond the events themselves, gathered by the caller so the diff stays pure. */
export interface XpTransactionContext {
  serverId: number;
  // The XP_REWARDS config table, read fresh each call so amounts can be
  // retuned without a deploy - see CONTEXT.md's XpTransaction entry. A
  // reason missing from this map produces no draft, rather than falling
  // back to a hardcoded default.
  xpRewards: Map<XpReason, number>;
  // matchId -> the id of that Match's earliest-recorded PlayerKilled
  // GameEvent, if any. Determines first_blood: a PlayerKilled event drafts
  // one only when its own id is the one this map names for its matchId.
  firstKillEventIdByMatch: Map<number, number>;
  // matchId -> completion info, present only for a MatchEnded event whose
  // Match this batch actually closed (every other MatchEnded reference is
  // impossible - a Match closes at most once).
  matchCompletions: Map<number, MatchCompletionInfo>;
}

// Which streak value each streak milestone reason fires at. Not every streak
// value is a milestone - see diffKillStreakGameEvents in game-events.ts for
// how a PlayerKillStreakIncreased event's metadata.streak carries every
// value in between, not just these three.
const STREAK_MILESTONE_REASONS: Partial<Record<number, XpReason>> = {
  3: "streak3",
  5: "streak5",
  10: "streak10",
};

function draft(
  context: XpTransactionContext,
  steamId: string,
  reason: XpReason,
  eventId: number,
): XpTransactionDraft | null {
  const amount = context.xpRewards.get(reason);
  if (amount === undefined) {
    return null;
  }
  return { serverId: context.serverId, steamId, amount, reason, eventId };
}

function killDrafts(event: RecordedGameEvent, context: XpTransactionContext): XpTransactionDraft[] {
  if (!event.steamId) {
    return [];
  }
  const drafts: XpTransactionDraft[] = [];

  const kill = draft(context, event.steamId, "kill", event.id);
  if (kill) {
    drafts.push(kill);
  }

  if (context.firstKillEventIdByMatch.get(event.matchId) === event.id) {
    const firstBlood = draft(context, event.steamId, "first_blood", event.id);
    if (firstBlood) {
      drafts.push(firstBlood);
    }
  }

  return drafts;
}

function streakMilestoneDrafts(event: RecordedGameEvent, context: XpTransactionContext): XpTransactionDraft[] {
  const streak = event.metadata?.streak;
  if (!event.steamId || typeof streak !== "number") {
    return [];
  }
  const reason = STREAK_MILESTONE_REASONS[streak];
  if (!reason) {
    return [];
  }
  const milestone = draft(context, event.steamId, reason, event.id);
  return milestone ? [milestone] : [];
}

function matchCompletionDrafts(event: RecordedGameEvent, context: XpTransactionContext): XpTransactionDraft[] {
  const completion = context.matchCompletions.get(event.matchId);
  if (!completion) {
    return [];
  }

  return completion.participants.flatMap((participant) => {
    const drafts: XpTransactionDraft[] = [];

    const completed = draft(context, participant.steamId, "match_completed", event.id);
    if (completed) {
      drafts.push(completed);
    }

    if (completion.winningFaction && participant.faction === completion.winningFaction) {
      const win = draft(context, participant.steamId, "match_win", event.id);
      if (win) {
        drafts.push(win);
      }
    }

    return drafts;
  });
}

/**
 * The Progression Engine's XpTransaction diff: computes every XpTransaction
 * draft a batch of freshly-recorded GameEvents should produce, given the
 * current XP_REWARDS config and the extra per-Match state (first-kill
 * lookup, match completion rosters) the caller gathered from the database.
 * Pure - the caller (match-tracker.ts) is responsible for persisting the
 * result via an insert guarded by xpTransactions' (event_id, reason,
 * steam_id) uniqueness, which is what actually makes a draft idempotent
 * under reprocessing; this function itself has no memory of what's already
 * been persisted.
 */
export function computeXpTransactionDrafts(
  events: RecordedGameEvent[],
  context: XpTransactionContext,
): XpTransactionDraft[] {
  return events.flatMap((event) => {
    switch (event.type) {
      case "PlayerKilled":
        return killDrafts(event, context);
      case "PlayerKillStreakStarted":
      case "PlayerKillStreakIncreased":
        return streakMilestoneDrafts(event, context);
      case "MatchEnded":
        return matchCompletionDrafts(event, context);
      default:
        return [];
    }
  });
}
