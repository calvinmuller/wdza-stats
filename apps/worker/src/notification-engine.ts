import type { NotificationKind, NotificationPriority } from "@wdza-stats/db";
import type { RecordedGameEvent } from "./xp-engine";

/** One row of the NOTIFICATION_RULES config table - see schema.ts and CONTEXT.md's Notification entry. */
export interface NotificationRuleConfig {
  priority: NotificationPriority;
  template: string;
}

/** One completed daily Challenge this poll's batch produced - gathered by the caller from applyChallengeProgressUpdates' result, since a Challenge completion has no GameEventType of its own (see notification.ts). */
export interface ChallengeCompletionNotificationInfo {
  steamId: string;
  // The triggering GameEvent (the PlayerKilled/MatchEnded/etc. that pushed
  // progress to target) - see schema.ts's notifications.eventId doc comment.
  eventId: number;
  challengeType: string;
}

/** Everything computeNotificationDrafts needs beyond the events/completions themselves, gathered by the caller so the diff stays pure. */
export interface NotificationContext {
  serverId: number;
  // The originating poll's capturedAt, shared by every draft this call
  // produces - matches how every GameEventDraft in one poll shares the same
  // context.timestamp (see game-events.ts).
  timestamp: Date;
  // The NOTIFICATION_RULES config table, read fresh each call so
  // priorities/templates can be retuned without a deploy - see xp-engine.ts's
  // xpRewards for the same convention. A kind missing from this map produces
  // no draft, rather than falling back to a hardcoded default.
  rules: Map<NotificationKind, NotificationRuleConfig>;
  // achievementId -> display name, for the AchievementUnlocked template -
  // gathered by the caller from achievementDefinitions for only the
  // achievementIds this batch's AchievementUnlocked events actually name.
  achievementNameById: Map<string, string>;
  // steamId -> playerCareerStats.displayName, for every steamId this batch's
  // drafts might name - gathered by the caller so templates can reference
  // {{playerName}} instead of the raw {{steamId}}. Falls back to the steamId
  // itself when a player has no career stats row yet (see draft functions
  // below), so this map is allowed to be missing an entry.
  playerNameBySteamId: Map<string, string>;
  // This poll's newly-opened Match's map, present only when this batch
  // actually opened one - for the MatchStarted template.
  openedMatchMap?: string;
  // This poll's newly-closed Match's winning Faction (null for a tie/no
  // Factions), present only when this batch actually closed one - for the
  // MatchEnded template.
  closedMatchWinner?: string | null;
}

export interface NotificationDraft {
  serverId: number;
  priority: NotificationPriority;
  message: string;
  eventId: number;
  timestamp: Date;
}

// Which streak value each streak-tier Notification kind fires at - mirrors
// xp-engine.ts's STREAK_MILESTONE_REASONS and achievement-engine.ts's seeded
// "killing_spree"/"rampage" thresholds (3/5/10), so a streak Notification
// fires exactly once per milestone crossed rather than once per kill for the
// remainder of a long streak - see ticket 10's "must not record one
// notification per kill" requirement, which this table extends to kill
// streaks generally, not just plain kills.
const STREAK_NOTIFICATION_KIND: Partial<Record<number, NotificationKind>> = {
  3: "KillStreak3",
  5: "KillStreak5",
  10: "KillStreak10",
};

/** `{{name}}`-style substitution against `vars`; an unmatched placeholder renders as empty string rather than erroring, so a retuned template naming a var this batch didn't supply degrades gracefully. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? "");
}

function draftFor(
  context: NotificationContext,
  kind: NotificationKind,
  eventId: number,
  vars: Record<string, string>,
): NotificationDraft | null {
  const rule = context.rules.get(kind);
  if (!rule) {
    return null;
  }
  return {
    serverId: context.serverId,
    priority: rule.priority,
    message: renderTemplate(rule.template, vars),
    eventId,
    timestamp: context.timestamp,
  };
}

function matchStartedDraft(event: RecordedGameEvent, context: NotificationContext): NotificationDraft | null {
  return draftFor(context, "MatchStarted", event.id, { map: context.openedMatchMap ?? "" });
}

function matchEndedDraft(event: RecordedGameEvent, context: NotificationContext): NotificationDraft | null {
  return draftFor(context, "MatchEnded", event.id, { winner: context.closedMatchWinner ?? "no one" });
}

function achievementUnlockedDraft(event: RecordedGameEvent, context: NotificationContext): NotificationDraft | null {
  const achievementId = event.metadata?.achievementId;
  if (!event.steamId || typeof achievementId !== "string") {
    return null;
  }
  const achievementName = context.achievementNameById.get(achievementId) ?? achievementId;
  const playerName = context.playerNameBySteamId.get(event.steamId) ?? event.steamId;
  return draftFor(context, "AchievementUnlocked", event.id, { steamId: event.steamId, playerName, achievementName });
}

function killStreakDraft(event: RecordedGameEvent, context: NotificationContext): NotificationDraft | null {
  const streak = event.metadata?.streak;
  if (!event.steamId || typeof streak !== "number") {
    return null;
  }
  const kind = STREAK_NOTIFICATION_KIND[streak];
  if (!kind) {
    return null;
  }
  const playerName = context.playerNameBySteamId.get(event.steamId) ?? event.steamId;
  return draftFor(context, kind, event.id, { steamId: event.steamId, playerName, streak: String(streak) });
}

function levelUpDraft(event: RecordedGameEvent, context: NotificationContext): NotificationDraft | null {
  const level = event.metadata?.level;
  if (!event.steamId || typeof level !== "number") {
    return null;
  }
  const playerName = context.playerNameBySteamId.get(event.steamId) ?? event.steamId;
  return draftFor(context, "PlayerLevelUp", event.id, { steamId: event.steamId, playerName, level: String(level) });
}

function isDraft(draft: NotificationDraft | null): draft is NotificationDraft {
  return draft !== null;
}

/**
 * The Notification Engine's draft diff: computes every NotificationDraft a
 * batch of freshly-recorded GameEvents (plus this poll's Challenge
 * completions, which have no GameEventType of their own - see
 * notification.ts) should produce, given the current NOTIFICATION_RULES
 * config. Pure - the caller (match-tracker.ts) is responsible for throttling
 * the result (see applyNotificationThrottle) and persisting what survives.
 *
 * Every GameEventType not switched on below - PlayerJoined/Left,
 * PlayerKilled/Death, FactionScoreChanged, FactionTookLead,
 * PlayerKillStreakBroken - never produces a Notification at all, regardless
 * of NOTIFICATION_RULES' contents: this is what makes "one notification per
 * kill" structurally impossible rather than merely throttled away (see
 * ticket 10's routine-events requirement).
 */
export function computeNotificationDrafts(
  events: RecordedGameEvent[],
  challengeCompletions: ChallengeCompletionNotificationInfo[],
  context: NotificationContext,
): NotificationDraft[] {
  const eventDrafts = events.flatMap((event) => {
    switch (event.type) {
      case "MatchStarted":
        return [matchStartedDraft(event, context)];
      case "MatchEnded":
        return [matchEndedDraft(event, context)];
      case "AchievementUnlocked":
        return [achievementUnlockedDraft(event, context)];
      case "PlayerKillStreakStarted":
      case "PlayerKillStreakIncreased":
        return [killStreakDraft(event, context)];
      case "PlayerLevelUp":
        return [levelUpDraft(event, context)];
      default:
        return [];
    }
  });

  const challengeDrafts = challengeCompletions.map((completion) =>
    draftFor(context, "ChallengeCompleted", completion.eventId, {
      steamId: completion.steamId,
      playerName: context.playerNameBySteamId.get(completion.steamId) ?? completion.steamId,
      challengeType: completion.challengeType,
    }),
  );

  return [...eventDrafts, ...challengeDrafts].filter(isDraft);
}

/**
 * Applies the configured max-per-minute cap to `drafts`: every "high"
 * priority draft always survives; a "low"/"normal" draft survives only while
 * `recentLowNormalCount` (this Server's low/normal Notification count already
 * recorded within the trailing 60s window - gathered by the caller from the
 * notifications table) plus however many this same call has already let
 * through stays under `maxPerMinute`. Pure and order-preserving: which drafts
 * get dropped when a batch itself exceeds the remaining budget is simply
 * whichever come later in `drafts`, since there's no further priority signal
 * to break ties on within a single poll's batch.
 */
export function applyNotificationThrottle(
  drafts: NotificationDraft[],
  recentLowNormalCount: number,
  maxPerMinute: number,
): NotificationDraft[] {
  let used = recentLowNormalCount;
  return drafts.filter((draft) => {
    if (draft.priority === "high") {
      return true;
    }
    if (used >= maxPerMinute) {
      return false;
    }
    used += 1;
    return true;
  });
}
