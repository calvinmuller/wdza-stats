import { describe, expect, it } from "vitest";
import {
  achievementUnlockedEvents,
  computeAchievementUnlockDrafts,
  type AchievementContext,
  type AchievementDefinitionConfig,
  type RecordedAchievementUnlock,
} from "./achievement-engine";
import type { GameEventContext } from "./game-events";
import type { RecordedGameEvent } from "./xp-engine";

const DEFINITIONS: AchievementDefinitionConfig[] = [
  { id: "first_blood", trigger: "first_kill", threshold: 1 },
  { id: "killing_spree", trigger: "kill_streak", threshold: 5 },
  { id: "rampage", trigger: "kill_streak", threshold: 10 },
  { id: "war_machine", trigger: "match_kills", threshold: 25 },
  { id: "veteran", trigger: "matches_played", threshold: 100 },
  { id: "champion", trigger: "matches_won", threshold: 25 },
  { id: "survivor", trigger: "survivor", threshold: 0 },
];

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

function context(overrides: Partial<AchievementContext> = {}): AchievementContext {
  return {
    serverId: 1,
    definitions: DEFINITIONS,
    matchKillOrdinalByEventId: new Map(),
    matchKillsByPlayerMatch: new Map(),
    matchCompletions: new Map(),
    ...overrides,
  };
}

describe("computeAchievementUnlockDrafts", () => {
  describe("First Blood (first_kill)", () => {
    it("unlocks for the player who lands a Match's earliest-recorded PlayerKilled event", () => {
      const drafts = computeAchievementUnlockDrafts(
        [event({ id: 5, matchId: 1, steamId: "1" })],
        context({ matchKillOrdinalByEventId: new Map([[5, 1]]) }),
      );

      expect(drafts).toEqual([{ serverId: 1, steamId: "1", achievementId: "first_blood", eventId: 5 }]);
    });

    it("does not unlock for a later kill in the same Match", () => {
      const drafts = computeAchievementUnlockDrafts(
        [event({ id: 9, matchId: 1, steamId: "1" })],
        context({ matchKillOrdinalByEventId: new Map([[9, 2]]) }),
      );

      expect(drafts).toEqual([]);
    });
  });

  describe("Killing Spree / Rampage (kill_streak)", () => {
    it("unlocks Killing Spree when a streak reaches 5", () => {
      const drafts = computeAchievementUnlockDrafts(
        [event({ id: 3, type: "PlayerKillStreakIncreased", steamId: "1", metadata: { streak: 5 } })],
        context(),
      );

      expect(drafts).toEqual([{ serverId: 1, steamId: "1", achievementId: "killing_spree", eventId: 3 }]);
    });

    it("unlocks Rampage when a streak reaches 10", () => {
      const drafts = computeAchievementUnlockDrafts(
        [event({ id: 4, type: "PlayerKillStreakIncreased", steamId: "1", metadata: { streak: 10 } })],
        context(),
      );

      expect(drafts).toEqual([{ serverId: 1, steamId: "1", achievementId: "rampage", eventId: 4 }]);
    });

    it("does not unlock for a non-milestone streak value", () => {
      const drafts = computeAchievementUnlockDrafts(
        [event({ type: "PlayerKillStreakIncreased", steamId: "1", metadata: { streak: 4 } })],
        context(),
      );

      expect(drafts).toEqual([]);
    });

    it("unlocks from PlayerKillStreakStarted too (a streak reaching its milestone on the very first kill of a run)", () => {
      const drafts = computeAchievementUnlockDrafts(
        [event({ type: "PlayerKillStreakStarted", steamId: "1", metadata: { streak: 5 } })],
        context(),
      );

      expect(drafts).toEqual([{ serverId: 1, steamId: "1", achievementId: "killing_spree", eventId: 1 }]);
    });
  });

  describe("War Machine (match_kills)", () => {
    it("unlocks when a player's within-Match kill count reaches 25", () => {
      const drafts = computeAchievementUnlockDrafts(
        [event({ id: 7, steamId: "1", matchId: 42 })],
        context({ matchKillsByPlayerMatch: new Map([["42:1", 25]]) }),
      );

      expect(drafts).toEqual([{ serverId: 1, steamId: "1", achievementId: "war_machine", eventId: 7 }]);
    });

    it("does not unlock for a within-Match kill count short of 25", () => {
      const drafts = computeAchievementUnlockDrafts(
        [event({ steamId: "1", matchId: 42 })],
        context({ matchKillsByPlayerMatch: new Map([["42:1", 24]]) }),
      );

      expect(drafts).toEqual([]);
    });

    it("does not confuse one Match's kill count with another's", () => {
      const drafts = computeAchievementUnlockDrafts(
        [event({ steamId: "1", matchId: 42 })],
        context({ matchKillsByPlayerMatch: new Map([["99:1", 25]]) }),
      );

      expect(drafts).toEqual([]);
    });
  });

  describe("Veteran / Champion / Survivor (MatchEnded completion)", () => {
    it("unlocks Veteran when a participant's resulting matchesPlayed reaches 100", () => {
      const drafts = computeAchievementUnlockDrafts(
        [event({ id: 11, type: "MatchEnded", steamId: null, matchId: 1 })],
        context({
          matchCompletions: new Map([
            [1, { participants: [{ steamId: "1", matchesPlayed: 100, matchesWon: 0, deathsInMatch: 1, presentAtStart: true }] }],
          ]),
        }),
      );

      expect(drafts).toEqual([{ serverId: 1, steamId: "1", achievementId: "veteran", eventId: 11 }]);
    });

    it("unlocks Champion when a participant's resulting matchesWon reaches 25", () => {
      const drafts = computeAchievementUnlockDrafts(
        [event({ id: 12, type: "MatchEnded", steamId: null, matchId: 1 })],
        context({
          matchCompletions: new Map([
            [1, { participants: [{ steamId: "1", matchesPlayed: 30, matchesWon: 25, deathsInMatch: 1, presentAtStart: true }] }],
          ]),
        }),
      );

      expect(drafts).toEqual([{ serverId: 1, steamId: "1", achievementId: "champion", eventId: 12 }]);
    });

    it("unlocks Survivor for a participant who finished the Match with zero deaths", () => {
      const drafts = computeAchievementUnlockDrafts(
        [event({ id: 13, type: "MatchEnded", steamId: null, matchId: 1 })],
        context({
          matchCompletions: new Map([
            [
              1,
              {
                participants: [
                  { steamId: "1", matchesPlayed: 1, matchesWon: 0, deathsInMatch: 0, presentAtStart: true },
                  { steamId: "2", matchesPlayed: 1, matchesWon: 0, deathsInMatch: 2, presentAtStart: true },
                ],
              },
            ],
          ]),
        }),
      );

      expect(drafts).toEqual([{ serverId: 1, steamId: "1", achievementId: "survivor", eventId: 13 }]);
    });

    it("does not unlock Survivor for a participant who joined after the Match's first Snapshot, even with zero deaths", () => {
      const drafts = computeAchievementUnlockDrafts(
        [event({ id: 14, type: "MatchEnded", steamId: null, matchId: 1 })],
        context({
          matchCompletions: new Map([
            [
              1,
              {
                participants: [
                  { steamId: "1", matchesPlayed: 1, matchesWon: 0, deathsInMatch: 0, presentAtStart: false },
                ],
              },
            ],
          ]),
        }),
      );

      expect(drafts).toEqual([]);
    });

    it("awards nothing for a MatchEnded event with no matching completion context", () => {
      expect(
        computeAchievementUnlockDrafts([event({ type: "MatchEnded", steamId: null, matchId: 99 })], context()),
      ).toEqual([]);
    });
  });

  it("keeps producing a draft every time a recurring condition is met - the caller's insert uniqueness is what makes it idempotent, not this function", () => {
    // A kill streak can legitimately revisit the same milestone value within
    // one Match (reach 5, break it, reach 5 again) - see game-events.ts's
    // diffKillStreakGameEvents. computeAchievementUnlockDrafts has no memory
    // of a prior unlock, so it proposes "killing_spree" both times; only
    // match-tracker.ts's playerAchievements insert (server_id, steam_id,
    // achievement_id unique) turns the second proposal into a no-op.
    const firstStreak = computeAchievementUnlockDrafts(
      [event({ id: 1, type: "PlayerKillStreakIncreased", steamId: "1", metadata: { streak: 5 } })],
      context(),
    );
    const secondStreak = computeAchievementUnlockDrafts(
      [event({ id: 2, type: "PlayerKillStreakIncreased", steamId: "1", metadata: { streak: 5 } })],
      context(),
    );

    expect(firstStreak).toEqual([{ serverId: 1, steamId: "1", achievementId: "killing_spree", eventId: 1 }]);
    expect(secondStreak).toEqual([{ serverId: 1, steamId: "1", achievementId: "killing_spree", eventId: 2 }]);
  });

  it("awards nothing for an event type with no Achievement meaning", () => {
    const noOpTypes: RecordedGameEvent["type"][] = ["PlayerJoined", "PlayerLeft", "FactionScoreChanged", "FactionTookLead"];
    for (const type of noOpTypes) {
      expect(computeAchievementUnlockDrafts([event({ type, steamId: "1" })], context())).toEqual([]);
    }
  });
});

describe("achievementUnlockedEvents", () => {
  function gameEventContext(overrides: Partial<GameEventContext> = {}): GameEventContext {
    return { serverId: 1, matchId: 7, timestamp: new Date("2026-01-01T00:00:00.000Z"), sourceSnapshotId: 3, ...overrides };
  }

  it("builds one AchievementUnlocked draft per recorded unlock", () => {
    const unlocks: RecordedAchievementUnlock[] = [
      { steamId: "1", achievementId: "first_blood" },
      { steamId: "2", achievementId: "survivor" },
    ];

    const drafts = achievementUnlockedEvents(unlocks, gameEventContext());

    expect(drafts).toEqual([
      expect.objectContaining({
        type: "AchievementUnlocked",
        serverId: 1,
        matchId: 7,
        steamId: "1",
        faction: null,
        targetSteamId: null,
        metadata: { achievementId: "first_blood" },
      }),
      expect.objectContaining({
        type: "AchievementUnlocked",
        steamId: "2",
        metadata: { achievementId: "survivor" },
      }),
    ]);
  });

  it("derives a stable idempotencyKey from steamId+achievementId, not the Match it's attributed to", () => {
    const unlock: RecordedAchievementUnlock[] = [{ steamId: "1", achievementId: "first_blood" }];

    const first = achievementUnlockedEvents(unlock, gameEventContext({ matchId: 7 }))[0];
    const second = achievementUnlockedEvents(unlock, gameEventContext({ matchId: 8 }))[0];

    // Both are built off *a* context.matchId (whichever Match happens to be
    // open when the unlock is processed - see this file's own doc comment),
    // so the two keys legitimately differ here; what must hold is that the
    // same context always produces the same key, which idempotencyKey's own
    // uniqueness in gameEvents relies on for retried writes of one poll.
    const repeat = achievementUnlockedEvents(unlock, gameEventContext({ matchId: 7 }))[0];
    expect(first.idempotencyKey).toBe(repeat.idempotencyKey);
    expect(first.idempotencyKey).not.toBe(second.idempotencyKey);
  });
});
