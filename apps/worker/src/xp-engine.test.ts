import type { GameEventType } from "@wdza-stats/db";
import { describe, expect, it } from "vitest";
import { computeXpTransactionDrafts, type RecordedGameEvent, type XpTransactionContext } from "./xp-engine";

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

function context(overrides: Partial<XpTransactionContext> = {}): XpTransactionContext {
  return {
    serverId: 1,
    xpRewards: new Map([
      ["kill", 100],
      ["match_completed", 250],
      ["match_win", 500],
      ["first_blood", 100],
      ["streak3", 150],
      ["streak5", 250],
      ["streak10", 500],
    ]),
    firstKillEventIdByMatch: new Map(),
    matchCompletions: new Map(),
    ...overrides,
  };
}

describe("computeXpTransactionDrafts", () => {
  it("awards the configured kill amount for a PlayerKilled event", () => {
    const awards = computeXpTransactionDrafts([event({ id: 5, steamId: "1" })], context());

    expect(awards).toEqual([
      { serverId: 1, steamId: "1", amount: 100, reason: "kill", eventId: 5 },
    ]);
  });

  it("also awards first_blood when the event is the Match's earliest recorded PlayerKilled event", () => {
    const awards = computeXpTransactionDrafts(
      [event({ id: 5, matchId: 1, steamId: "1" })],
      context({ firstKillEventIdByMatch: new Map([[1, 5]]) }),
    );

    expect(awards).toEqual(
      expect.arrayContaining([
        { serverId: 1, steamId: "1", amount: 100, reason: "kill", eventId: 5 },
        { serverId: 1, steamId: "1", amount: 100, reason: "first_blood", eventId: 5 },
      ]),
    );
    expect(awards).toHaveLength(2);
  });

  it("does not award first_blood for a kill that isn't the Match's earliest", () => {
    const awards = computeXpTransactionDrafts(
      [event({ id: 9, matchId: 1, steamId: "1" })],
      context({ firstKillEventIdByMatch: new Map([[1, 5]]) }),
    );

    expect(awards).toEqual([{ serverId: 1, steamId: "1", amount: 100, reason: "kill", eventId: 9 }]);
  });

  it("awards nothing for an event type with no XP meaning", () => {
    const noOpTypes: GameEventType[] = ["PlayerJoined", "PlayerLeft", "FactionScoreChanged", "FactionTookLead"];
    for (const type of noOpTypes) {
      expect(computeXpTransactionDrafts([event({ type, steamId: "1" })], context())).toEqual([]);
    }
  });

  it.each([
    [3, "streak3", 150],
    [5, "streak5", 250],
    [10, "streak10", 500],
  ] as const)("awards %s XP for a streak reaching %i", (streak, reason, amount) => {
    const awards = computeXpTransactionDrafts(
      [event({ id: 7, type: "PlayerKillStreakIncreased", steamId: "1", metadata: { streak } })],
      context(),
    );

    expect(awards).toEqual([{ serverId: 1, steamId: "1", amount, reason, eventId: 7 }]);
  });

  it("does not award a streak milestone for a non-milestone streak value", () => {
    const awards = computeXpTransactionDrafts(
      [event({ type: "PlayerKillStreakIncreased", steamId: "1", metadata: { streak: 4 } })],
      context(),
    );

    expect(awards).toEqual([]);
  });

  it("does not award a streak milestone for PlayerKillStreakStarted at streak 1", () => {
    const awards = computeXpTransactionDrafts(
      [event({ type: "PlayerKillStreakStarted", steamId: "1", metadata: { streak: 1 } })],
      context(),
    );

    expect(awards).toEqual([]);
  });

  it("awards match_completed to every participant of a MatchEnded event", () => {
    const awards = computeXpTransactionDrafts(
      [event({ id: 3, type: "MatchEnded", steamId: null, matchId: 1 })],
      context({
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

    expect(awards).toEqual([
      { serverId: 1, steamId: "1", amount: 250, reason: "match_completed", eventId: 3 },
      { serverId: 1, steamId: "2", amount: 250, reason: "match_completed", eventId: 3 },
    ]);
  });

  it("additionally awards match_win to participants on the winning Faction", () => {
    const awards = computeXpTransactionDrafts(
      [event({ id: 3, type: "MatchEnded", steamId: null, matchId: 1 })],
      context({
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

    expect(awards).toEqual([
      { serverId: 1, steamId: "1", amount: 250, reason: "match_completed", eventId: 3 },
      { serverId: 1, steamId: "1", amount: 500, reason: "match_win", eventId: 3 },
      { serverId: 1, steamId: "2", amount: 250, reason: "match_completed", eventId: 3 },
    ]);
  });

  it("awards nothing for a MatchEnded event with no matching completion context", () => {
    expect(computeXpTransactionDrafts([event({ type: "MatchEnded", steamId: null, matchId: 99 })], context())).toEqual([]);
  });
});
