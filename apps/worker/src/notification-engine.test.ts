import type { NotificationKind } from "@wdza-stats/db";
import { describe, expect, it } from "vitest";
import {
  applyNotificationThrottle,
  computeNotificationDrafts,
  renderTemplate,
  type ChallengeCompletionNotificationInfo,
  type NotificationContext,
  type NotificationDraft,
  type NotificationRuleConfig,
} from "./notification-engine";
import type { RecordedGameEvent } from "./xp-engine";

function event(overrides: Partial<RecordedGameEvent> = {}): RecordedGameEvent {
  return {
    id: 1,
    type: "PlayerKilled",
    steamId: "1",
    matchId: 1,
    metadata: null,
    ...overrides,
  };
}

const RULES: [NotificationKind, NotificationRuleConfig][] = [
  ["MatchStarted", { priority: "high", template: "Match started on {{map}}" }],
  ["MatchEnded", { priority: "high", template: "Match ended - {{winner}} wins" }],
  ["AchievementUnlocked", { priority: "high", template: "{{steamId}} unlocked {{achievementName}}" }],
  ["FirstBlood", { priority: "high", template: "{{steamId}} drew first blood" }],
  ["KillStreak10", { priority: "high", template: "{{steamId}} hit a {{streak}} streak" }],
  ["ChallengeCompleted", { priority: "high", template: "{{steamId}} completed {{challengeType}}" }],
  ["KillStreak5", { priority: "normal", template: "{{steamId}} hit a {{streak}} streak" }],
  ["PlayerLevelUp", { priority: "normal", template: "{{steamId}} reached level {{level}}" }],
  ["KillStreak3", { priority: "low", template: "{{steamId}} hit a {{streak}} streak" }],
];

function context(overrides: Partial<NotificationContext> = {}): NotificationContext {
  return {
    serverId: 1,
    timestamp: new Date("2026-01-01T00:00:00Z"),
    rules: new Map(RULES),
    achievementNameById: new Map([["killing_spree", "Killing Spree"]]),
    playerNameBySteamId: new Map(),
    firstKillEventIdByMatch: new Map(),
    ...overrides,
  };
}

describe("renderTemplate", () => {
  it("substitutes every {{placeholder}} with its var", () => {
    expect(renderTemplate("{{steamId}} did {{thing}}", { steamId: "1", thing: "a kill" })).toBe("1 did a kill");
  });

  it("renders a placeholder with no matching var as an empty string", () => {
    expect(renderTemplate("hello {{name}}", {})).toBe("hello ");
  });
});

describe("computeNotificationDrafts", () => {
  it("produces a high-priority draft for MatchStarted, using the opened Match's map", () => {
    const drafts = computeNotificationDrafts(
      [event({ id: 10, type: "MatchStarted", steamId: null })],
      [],
      context({ openedMatchMap: "Sandstorm" }),
    );

    expect(drafts).toEqual([
      { serverId: 1, priority: "high", message: "Match started on Sandstorm", eventId: 10, timestamp: context().timestamp },
    ]);
  });

  it("produces a high-priority draft for MatchEnded, using the closed Match's winner", () => {
    const drafts = computeNotificationDrafts(
      [event({ id: 11, type: "MatchEnded", steamId: null })],
      [],
      context({ closedMatchWinner: "Lonestar" }),
    );

    expect(drafts).toMatchObject([{ priority: "high", message: "Match ended - Lonestar wins" }]);
  });

  it("falls back to 'no one' for a MatchEnded draft when the Match closed with no winner", () => {
    const drafts = computeNotificationDrafts(
      [event({ id: 12, type: "MatchEnded", steamId: null })],
      [],
      context({ closedMatchWinner: null }),
    );

    expect(drafts).toMatchObject([{ message: "Match ended - no one wins" }]);
  });

  it("produces a high-priority draft for AchievementUnlocked, looking up the achievement's display name", () => {
    const drafts = computeNotificationDrafts(
      [event({ id: 13, type: "AchievementUnlocked", steamId: "1", metadata: { achievementId: "killing_spree" } })],
      [],
      context(),
    );

    expect(drafts).toMatchObject([{ priority: "high", message: "1 unlocked Killing Spree" }]);
  });

  it("never produces a Notification for a PlayerKilled event that isn't its Match's first kill", () => {
    expect(computeNotificationDrafts([event({ id: 2, type: "PlayerKilled" })], [], context())).toEqual([]);
  });

  it("produces a high-priority FirstBlood draft for the PlayerKilled event that is its Match's first kill", () => {
    const drafts = computeNotificationDrafts(
      [event({ id: 1, type: "PlayerKilled", steamId: "1", matchId: 1 })],
      [],
      context({ firstKillEventIdByMatch: new Map([[1, 1]]) }),
    );

    expect(drafts).toMatchObject([{ priority: "high", message: "1 drew first blood" }]);
  });

  it("never produces a Notification for PlayerJoined/PlayerLeft or FactionScoreChanged", () => {
    const drafts = computeNotificationDrafts(
      [
        event({ id: 1, type: "PlayerJoined" }),
        event({ id: 2, type: "PlayerLeft" }),
        event({ id: 3, type: "FactionScoreChanged", steamId: null }),
        event({ id: 4, type: "PlayerKillStreakBroken", metadata: { streak: 4 } }),
      ],
      [],
      context(),
    );

    expect(drafts).toEqual([]);
  });

  it("fires exactly one streak Notification per milestone crossed, at escalating priority", () => {
    const drafts = computeNotificationDrafts(
      [3, 5, 10].map((streak) =>
        event({ id: streak, type: "PlayerKillStreakIncreased", metadata: { streak } }),
      ),
      [],
      context(),
    );

    expect(drafts.map((d) => d.priority)).toEqual(["low", "normal", "high"]);
  });

  it("produces no streak Notification for a non-milestone streak value", () => {
    const drafts = computeNotificationDrafts(
      [event({ id: 1, type: "PlayerKillStreakIncreased", metadata: { streak: 4 } })],
      [],
      context(),
    );

    expect(drafts).toEqual([]);
  });

  it("produces a normal-priority draft for PlayerLevelUp", () => {
    const drafts = computeNotificationDrafts(
      [event({ id: 20, type: "PlayerLevelUp", steamId: "1", metadata: { level: 3 } })],
      [],
      context(),
    );

    expect(drafts).toMatchObject([{ priority: "normal", message: "1 reached level 3" }]);
  });

  it("produces a high-priority draft for each Challenge completion, keyed off the triggering GameEvent", () => {
    const completions: ChallengeCompletionNotificationInfo[] = [
      { steamId: "1", eventId: 42, challengeType: "kills" },
    ];

    const drafts = computeNotificationDrafts([], completions, context());

    expect(drafts).toEqual([
      { serverId: 1, priority: "high", message: "1 completed kills", eventId: 42, timestamp: context().timestamp },
    ]);
  });

  it("resolves {{playerName}} from the context's playerNameBySteamId map", () => {
    const drafts = computeNotificationDrafts(
      [event({ id: 30, type: "PlayerKillStreakIncreased", steamId: "1", metadata: { streak: 5 } })],
      [],
      context({
        rules: new Map([["KillStreak5", { priority: "normal", template: "{{playerName}} hit a {{streak}} streak" }]]),
        playerNameBySteamId: new Map([["1", "Shadow"]]),
      }),
    );

    expect(drafts).toMatchObject([{ message: "Shadow hit a 5 streak" }]);
  });

  it("falls back to the raw steamId for {{playerName}} when the context has no display name for it", () => {
    const drafts = computeNotificationDrafts(
      [event({ id: 31, type: "PlayerKillStreakIncreased", steamId: "1", metadata: { streak: 5 } })],
      [],
      context({
        rules: new Map([["KillStreak5", { priority: "normal", template: "{{playerName}} hit a {{streak}} streak" }]]),
      }),
    );

    expect(drafts).toMatchObject([{ message: "1 hit a 5 streak" }]);
  });

  it("produces nothing for a kind missing from the NOTIFICATION_RULES config", () => {
    const drafts = computeNotificationDrafts(
      [event({ id: 1, type: "AchievementUnlocked", steamId: "1", metadata: { achievementId: "x" } })],
      [],
      context({ rules: new Map() }),
    );

    expect(drafts).toEqual([]);
  });
});

describe("applyNotificationThrottle", () => {
  function draft(overrides: Partial<NotificationDraft> = {}): NotificationDraft {
    return {
      serverId: 1,
      priority: "normal",
      message: "test",
      eventId: 1,
      timestamp: new Date("2026-01-01T00:00:00Z"),
      ...overrides,
    };
  }

  it("never drops a high-priority draft, even far past the cap", () => {
    const drafts = [draft({ priority: "high" }), draft({ priority: "high" })];

    expect(applyNotificationThrottle(drafts, 1000, 1)).toEqual(drafts);
  });

  it("passes low/normal drafts through while under the remaining budget", () => {
    const drafts = [draft({ priority: "low" }), draft({ priority: "normal" })];

    expect(applyNotificationThrottle(drafts, 0, 5)).toEqual(drafts);
  });

  it("suppresses low/normal drafts once the trailing-minute count already reached the cap", () => {
    const drafts = [draft({ priority: "low" })];

    expect(applyNotificationThrottle(drafts, 20, 20)).toEqual([]);
  });

  it("suppresses only the excess within one batch once the remaining budget runs out mid-batch", () => {
    const drafts = [draft({ priority: "low", eventId: 1 }), draft({ priority: "low", eventId: 2 })];

    expect(applyNotificationThrottle(drafts, 19, 20)).toEqual([drafts[0]]);
  });

  it("never lets a suppressed low/normal draft consume budget a later high-priority draft needs", () => {
    const drafts = [draft({ priority: "low", eventId: 1 }), draft({ priority: "high", eventId: 2 })];

    expect(applyNotificationThrottle(drafts, 20, 20)).toEqual([drafts[1]]);
  });
});
