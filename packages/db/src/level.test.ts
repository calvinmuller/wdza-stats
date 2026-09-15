import { describe, expect, it } from "vitest";
import { levelForXp, levelProgressForXp, type LevelThreshold } from "./level";

const thresholds: LevelThreshold[] = [
  { level: 1, xpRequired: 0 },
  { level: 2, xpRequired: 1000 },
  { level: 3, xpRequired: 2500 },
  { level: 4, xpRequired: 4500 },
];

describe("levelForXp", () => {
  it("is the floor level for 0 XP", () => {
    expect(levelForXp(0, thresholds)).toBe(1);
  });

  it("stays at the current level until xp reaches the next threshold", () => {
    expect(levelForXp(999, thresholds)).toBe(1);
  });

  it("is exactly the next level when xp lands exactly on its threshold", () => {
    expect(levelForXp(1000, thresholds)).toBe(2);
  });

  it("is the highest level whose threshold xp has passed", () => {
    expect(levelForXp(3000, thresholds)).toBe(3);
  });

  it("is unaffected by threshold row order", () => {
    const shuffled = [...thresholds].reverse();
    expect(levelForXp(3000, shuffled)).toBe(3);
  });

  it("falls back to the lowest configured level for an empty curve", () => {
    expect(levelForXp(5000, [])).toBe(1);
  });
});

describe("levelProgressForXp", () => {
  it("reports xpIntoLevel and the span to the next level, mid-level", () => {
    expect(levelProgressForXp(1300, thresholds)).toEqual({
      level: 2,
      xpIntoLevel: 300,
      xpRequiredForNextLevel: 1500,
      progressPercent: 20,
    });
  });

  it("reports 0% progress right at a level's own threshold", () => {
    expect(levelProgressForXp(1000, thresholds)).toEqual({
      level: 2,
      xpIntoLevel: 0,
      xpRequiredForNextLevel: 1500,
      progressPercent: 0,
    });
  });

  it("reports 100% progress and no next-level span at the curve's max configured level", () => {
    expect(levelProgressForXp(10000, thresholds)).toEqual({
      level: 4,
      xpIntoLevel: 5500,
      xpRequiredForNextLevel: null,
      progressPercent: 100,
    });
  });
});
