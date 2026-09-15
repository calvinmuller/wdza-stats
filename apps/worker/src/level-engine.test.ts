import { describe, expect, it } from "vitest";
import type { GameEventContext } from "./game-events";
import { levelUpEvents } from "./level-engine";

function context(overrides: Partial<GameEventContext> = {}): GameEventContext {
  return {
    serverId: 1,
    matchId: 1,
    timestamp: new Date("2026-01-01T00:00:00Z"),
    sourceSnapshotId: 1,
    ...overrides,
  };
}

describe("levelUpEvents", () => {
  it("emits nothing when previousLevel and newLevel are the same", () => {
    const events = levelUpEvents("1", 1, 1, context());

    expect(events).toEqual([]);
  });

  it("emits one PlayerLevelUp event when exactly one level is gained", () => {
    const events = levelUpEvents("1", 1, 2, context());

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "PlayerLevelUp",
      steamId: "1",
      metadata: { level: 2 },
    });
  });

  it("emits one event per level when two levels are gained at once", () => {
    const events = levelUpEvents("1", 1, 3, context());

    expect(events.map((event) => event.metadata)).toEqual([{ level: 2 }, { level: 3 }]);
  });

  it("carries the batch's serverId/matchId/timestamp/sourceSnapshotId onto every draft", () => {
    const ctx = context({ serverId: 7, matchId: 42, sourceSnapshotId: 99 });
    const events = levelUpEvents("1", 1, 2, ctx);

    expect(events[0]).toMatchObject({
      serverId: 7,
      matchId: 42,
      timestamp: ctx.timestamp,
      sourceSnapshotId: 99,
      targetSteamId: null,
      faction: null,
    });
  });

  it("produces distinct idempotency keys per level gained", () => {
    const events = levelUpEvents("1", 1, 3, context());

    expect(new Set(events.map((event) => event.idempotencyKey)).size).toBe(2);
  });
});
