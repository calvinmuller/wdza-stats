import { describe, expect, it } from "vitest";
import { computeMvp, mvpScoreFor, type MvpCandidate, type MvpFormulaWeights } from "./mvp-engine";

const seededWeights: MvpFormulaWeights = { killWeight: 10, deathWeight: -5 };

function candidate(overrides: Partial<MvpCandidate> = {}): MvpCandidate {
  return { steamId: "1", kills: 0, deaths: 0, ...overrides };
}

describe("mvpScoreFor", () => {
  it("applies the seeded default formula (kills x10 - deaths x5)", () => {
    expect(mvpScoreFor(candidate({ kills: 8, deaths: 2 }), seededWeights)).toBe(70);
  });

  it("is config-driven, not hardcoded to the seeded weights", () => {
    expect(mvpScoreFor(candidate({ kills: 8, deaths: 2 }), { killWeight: 1, deathWeight: 0 })).toBe(8);
  });
});

describe("computeMvp", () => {
  it("returns null for an empty roster", () => {
    expect(computeMvp([], seededWeights)).toBeNull();
  });

  it("picks the participant with the highest score", () => {
    const candidates = [
      candidate({ steamId: "1", kills: 5, deaths: 5 }), // 50 - 25 = 25
      candidate({ steamId: "2", kills: 10, deaths: 1 }), // 100 - 5 = 95
      candidate({ steamId: "3", kills: 2, deaths: 0 }), // 20
    ];

    expect(computeMvp(candidates, seededWeights)).toEqual({ steamId: "2", score: 95 });
  });

  it("breaks a tied score by more kills first", () => {
    // "1": 10 kills, 0 deaths -> 100. "2": 15 kills, 10 deaths -> 150 - 50 = 100.
    const candidates = [
      candidate({ steamId: "1", kills: 10, deaths: 0 }),
      candidate({ steamId: "2", kills: 15, deaths: 10 }),
    ];

    expect(computeMvp(candidates, seededWeights)).toEqual({ steamId: "2", score: 100 });
  });

  it("breaks a tie on score and kills by fewer deaths", () => {
    // A deathWeight of 0 means deaths don't affect score at all, so both
    // score 100 on 10 kills despite different death counts; "2" still wins
    // the tie-break on fewer deaths.
    const zeroDeathWeight: MvpFormulaWeights = { killWeight: 10, deathWeight: 0 };
    const candidates = [
      candidate({ steamId: "1", kills: 10, deaths: 4 }),
      candidate({ steamId: "2", kills: 10, deaths: 0 }),
    ];

    expect(computeMvp(candidates, zeroDeathWeight)).toEqual({ steamId: "2", score: 100 });
  });

  it("breaks a fully-tied score/kills/deaths by the smaller steamId", () => {
    const candidates = [
      candidate({ steamId: "2", kills: 4, deaths: 0 }),
      candidate({ steamId: "1", kills: 4, deaths: 0 }),
    ];

    expect(computeMvp(candidates, seededWeights)).toEqual({ steamId: "1", score: 40 });
  });
});
