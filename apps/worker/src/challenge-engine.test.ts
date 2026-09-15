import { describe, expect, it } from "vitest";
import {
  computeChallengeProgressUpdates,
  dailyChallengeInstanceDrafts,
  dailyPeriodKey,
  type ActiveChallengeInstance,
  type ChallengeDefinitionRow,
  type ChallengeProgressContext,
} from "./challenge-engine";
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

function instance(overrides: Partial<ActiveChallengeInstance> = {}): ActiveChallengeInstance {
  return { instanceId: 1, target: 3, xpReward: 300, ...overrides };
}

function context(overrides: Partial<ChallengeProgressContext> = {}): ChallengeProgressContext {
  return {
    instancesByType: new Map(),
    currentProgress: new Map(),
    matchCompletions: new Map(),
    killCountInMatch: new Map(),
    killsSinceDeath: new Map(),
    ...overrides,
  };
}

describe("dailyPeriodKey", () => {
  it("formats the UTC calendar date as YYYY-MM-DD", () => {
    expect(dailyPeriodKey(new Date("2026-03-05T23:59:59Z"))).toBe("2026-03-05");
  });

  it("is stable across different times on the same UTC day", () => {
    const a = dailyPeriodKey(new Date("2026-03-05T00:00:01Z"));
    const b = dailyPeriodKey(new Date("2026-03-05T23:00:00Z"));
    expect(a).toBe(b);
  });
});

describe("dailyChallengeInstanceDrafts", () => {
  function definition(overrides: Partial<ChallengeDefinitionRow> = {}): ChallengeDefinitionRow {
    return { id: 1, type: "kills", scope: "daily", target: 10, xpReward: 100, ...overrides };
  }

  it("drafts one instance per daily definition for the given server/period", () => {
    const drafts = dailyChallengeInstanceDrafts(
      [definition({ id: 1 }), definition({ id: 2 })],
      7,
      "2026-03-05",
    );

    expect(drafts).toEqual([
      { definitionId: 1, serverId: 7, periodKey: "2026-03-05" },
      { definitionId: 2, serverId: 7, periodKey: "2026-03-05" },
    ]);
  });

  it("skips definitions with a non-daily scope", () => {
    // @ts-expect-error - only "daily" exists today, but the filter must still hold for a future scope value
    const drafts = dailyChallengeInstanceDrafts([definition({ id: 1, scope: "weekly" })], 7, "2026-03-05");

    expect(drafts).toEqual([]);
  });
});

describe("computeChallengeProgressUpdates", () => {
  it("increments an active kills instance by 1 per PlayerKilled event", () => {
    const updates = computeChallengeProgressUpdates(
      [event({ id: 5, type: "PlayerKilled", steamId: "1" })],
      context({ instancesByType: new Map([["kills", [instance({ instanceId: 1 })]]]) }),
    );

    expect(updates).toEqual([{ instanceId: 1, steamId: "1", progress: 1, target: 3, xpReward: 300, eventId: 5 }]);
  });

  it("chains several qualifying events in one batch into consecutive progress", () => {
    const updates = computeChallengeProgressUpdates(
      [
        event({ id: 5, type: "PlayerKilled", steamId: "1" }),
        event({ id: 6, type: "PlayerKilled", steamId: "1" }),
        event({ id: 7, type: "PlayerKilled", steamId: "1" }),
      ],
      context({ instancesByType: new Map([["kills", [instance({ instanceId: 1, target: 3 })]]]) }),
    );

    expect(updates).toEqual([{ instanceId: 1, steamId: "1", progress: 3, target: 3, xpReward: 300, eventId: 7 }]);
  });

  it("starts from the player's current persisted progress, not 0", () => {
    const updates = computeChallengeProgressUpdates(
      [event({ id: 9, type: "PlayerKilled", steamId: "1" })],
      context({
        instancesByType: new Map([["kills", [instance({ instanceId: 1 })]]]),
        currentProgress: new Map([["1:1", 2]]),
      }),
    );

    expect(updates).toEqual([{ instanceId: 1, steamId: "1", progress: 3, target: 3, xpReward: 300, eventId: 9 }]);
  });

  it("does not touch instances of an unrelated type", () => {
    const updates = computeChallengeProgressUpdates(
      [event({ type: "PlayerKilled", steamId: "1" })],
      context({ instancesByType: new Map([["wins", [instance()]]]) }),
    );

    expect(updates).toEqual([]);
  });

  it("raises a kill_streak instance's watermark to metadata.streak, never decreasing it", () => {
    const updates = computeChallengeProgressUpdates(
      [
        event({ id: 1, type: "PlayerKillStreakStarted", steamId: "1", metadata: { streak: 1 } }),
        event({ id: 2, type: "PlayerKillStreakIncreased", steamId: "1", metadata: { streak: 2 } }),
      ],
      context({ instancesByType: new Map([["kill_streak", [instance({ instanceId: 1, target: 5 })]]]) }),
    );

    expect(updates).toEqual([{ instanceId: 1, steamId: "1", progress: 2, target: 5, xpReward: 300, eventId: 2 }]);
  });

  it("does not raise a kill_streak instance off a PlayerKilled event (only PlayerKillStreakStarted/Increased)", () => {
    const updates = computeChallengeProgressUpdates(
      [event({ id: 1, type: "PlayerKilled", steamId: "1" })],
      context({ instancesByType: new Map([["kill_streak", [instance({ instanceId: 9, target: 5 })]]]) }),
    );

    expect(updates).toEqual([]);
  });

  it("raises a kills_without_dying instance's watermark to the player's kills since their last death, off PlayerKilled (not streak events)", () => {
    const updates = computeChallengeProgressUpdates(
      [event({ id: 4, type: "PlayerKilled", steamId: "1" })],
      context({
        instancesByType: new Map([["kills_without_dying", [instance({ instanceId: 9, target: 5 })]]]),
        killsSinceDeath: new Map([["1", 3]]),
      }),
    );

    expect(updates).toEqual([{ instanceId: 9, steamId: "1", progress: 3, target: 5, xpReward: 300, eventId: 4 }]);
  });

  it("does not raise a kills_without_dying instance off a kill_streak event", () => {
    const updates = computeChallengeProgressUpdates(
      [event({ id: 1, type: "PlayerKillStreakStarted", steamId: "1", metadata: { streak: 1 } })],
      context({
        instancesByType: new Map([["kills_without_dying", [instance({ instanceId: 9, target: 5 })]]]),
      }),
    );

    expect(updates).toEqual([]);
  });

  it("kill_streak and kills_without_dying diverge when a Match boundary intervenes (kills_without_dying keeps counting, kill_streak does not)", () => {
    // Same player, same day, two separate Matches, no deaths in between -
    // killsSinceDeath (Match-independent) reflects the combined run, while a
    // kill_streak instance only ever sees each Match's own streak events.
    const updates = computeChallengeProgressUpdates(
      [event({ id: 10, type: "PlayerKilled", steamId: "1", matchId: 2 })],
      context({
        instancesByType: new Map([
          ["kill_streak", [instance({ instanceId: 1, target: 5 })]],
          ["kills_without_dying", [instance({ instanceId: 2, target: 5 })]],
        ]),
        currentProgress: new Map([
          ["1:1", 3], // kill_streak's own watermark from the prior (now-ended) Match
          ["2:1", 3], // kills_without_dying's watermark, carried the same way
        ]),
        killsSinceDeath: new Map([["1", 4]]), // one more kill in the new Match, still no death
      }),
    );

    expect(updates).toEqual([{ instanceId: 2, steamId: "1", progress: 4, target: 5, xpReward: 300, eventId: 10 }]);
  });

  it("does not lower a watermark when a later streak resets below the persisted progress", () => {
    const updates = computeChallengeProgressUpdates(
      [event({ id: 3, type: "PlayerKillStreakStarted", steamId: "1", metadata: { streak: 1 } })],
      context({
        instancesByType: new Map([["kill_streak", [instance({ instanceId: 1, target: 5 })]]]),
        currentProgress: new Map([["1:1", 4]]),
      }),
    );

    expect(updates).toEqual([{ instanceId: 1, steamId: "1", progress: 4, target: 5, xpReward: 300, eventId: 3 }]);
  });

  it("raises a kills_in_match instance's watermark to the player's kill count for that Match", () => {
    const updates = computeChallengeProgressUpdates(
      [event({ id: 4, type: "PlayerKilled", steamId: "1", matchId: 12 })],
      context({
        instancesByType: new Map([["kills_in_match", [instance({ instanceId: 1, target: 10 })]]]),
        killCountInMatch: new Map([["12:1", 6]]),
      }),
    );

    expect(updates).toEqual([{ instanceId: 1, steamId: "1", progress: 6, target: 10, xpReward: 300, eventId: 4 }]);
  });

  it("increments matches_played for every participant of a MatchEnded event", () => {
    const updates = computeChallengeProgressUpdates(
      [event({ id: 3, type: "MatchEnded", steamId: null, matchId: 1 })],
      context({
        instancesByType: new Map([["matches_played", [instance({ instanceId: 1, target: 3 })]]]),
        matchCompletions: new Map([
          [
            1,
            {
              winningFaction: null,
              participants: [
                { steamId: "1", faction: "Lonestar" },
                { steamId: "2", faction: "Valkyra" },
              ],
            },
          ],
        ]),
      }),
    );

    expect(updates).toEqual(
      expect.arrayContaining([
        { instanceId: 1, steamId: "1", progress: 1, target: 3, xpReward: 300, eventId: 3 },
        { instanceId: 1, steamId: "2", progress: 1, target: 3, xpReward: 300, eventId: 3 },
      ]),
    );
    expect(updates).toHaveLength(2);
  });

  it("additionally increments wins only for participants on the winning Faction", () => {
    const updates = computeChallengeProgressUpdates(
      [event({ id: 3, type: "MatchEnded", steamId: null, matchId: 1 })],
      context({
        instancesByType: new Map([["wins", [instance({ instanceId: 2, target: 2 })]]]),
        matchCompletions: new Map([
          [
            1,
            {
              winningFaction: "Lonestar",
              participants: [
                { steamId: "1", faction: "Lonestar" },
                { steamId: "2", faction: "Valkyra" },
              ],
            },
          ],
        ]),
      }),
    );

    expect(updates).toEqual([{ instanceId: 2, steamId: "1", progress: 1, target: 2, xpReward: 300, eventId: 3 }]);
  });

  it("produces nothing for a MatchEnded event with no matching completion context", () => {
    const updates = computeChallengeProgressUpdates(
      [event({ type: "MatchEnded", steamId: null, matchId: 99 })],
      context({ instancesByType: new Map([["matches_played", [instance()]]]) }),
    );

    expect(updates).toEqual([]);
  });

  it("produces nothing for an event type with no challenge meaning", () => {
    const updates = computeChallengeProgressUpdates(
      [event({ type: "FactionTookLead", steamId: null })],
      context({ instancesByType: new Map([["kills", [instance()]]]) }),
    );

    expect(updates).toEqual([]);
  });
});
