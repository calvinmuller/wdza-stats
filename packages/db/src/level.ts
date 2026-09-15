// The level curve: how much cumulative XP (PlayerCareerStat.xp) a level
// requires, config-driven via the level_thresholds table rather than a
// hardcoded per-level formula/switch in application or UI code. See
// CONTEXT.md's PlayerCareerStat entry (level is one of its gamification
// totals) and spec.md's Domain Decisions for the seeded default curve
// (level 1 = 0 XP, level 2 = 1,000, level 3 = 2,500, level 4 = 4,500, …).

export interface LevelThreshold {
  level: number;
  xpRequired: number;
}

/**
 * The highest level whose xpRequired is <= xp, per `thresholds` - the
 * Progression Engine's sole source of truth for "what level does this much
 * XP represent", so no caller (worker or web) ever reimplements the curve
 * itself. Falls back to the lowest configured level when `thresholds` is
 * empty or `xp` sits below every seeded row (shouldn't happen given level 1
 * is always seeded at 0 XP, but keeps this function total instead of
 * throwing).
 */
export function levelForXp(xp: number, thresholds: LevelThreshold[]): number {
  const sorted = [...thresholds].sort((a, b) => a.level - b.level);
  let level = sorted[0]?.level ?? 1;
  for (const threshold of sorted) {
    if (threshold.xpRequired > xp) {
      break;
    }
    level = threshold.level;
  }
  return level;
}

export interface LevelProgress {
  level: number;
  xpIntoLevel: number;
  // The XP span from the current level's own threshold to the next level's -
  // the denominator for a "xpIntoLevel / xpRequiredForNextLevel" progress
  // bar. Null once `xp` is at or past the curve's highest configured level,
  // since there's no next threshold to measure against yet (extend
  // level_thresholds to raise the ceiling).
  xpRequiredForNextLevel: number | null;
  // 0-100. Pinned to 100 at the curve's max configured level, since there's
  // no further span left to measure progress against.
  progressPercent: number;
}

/**
 * The full progress picture for a given XP total: level, how far into that
 * level the player is, how much more XP the next level needs, and that as a
 * percentage. The one helper both the Progression Engine (see
 * apps/worker/src/level-engine.ts, for detecting a level crossing) and any
 * player-facing UI should call instead of re-deriving any of this from
 * level_thresholds directly.
 */
export function levelProgressForXp(xp: number, thresholds: LevelThreshold[]): LevelProgress {
  const sorted = [...thresholds].sort((a, b) => a.level - b.level);
  const level = levelForXp(xp, sorted);
  const currentIndex = sorted.findIndex((threshold) => threshold.level === level);
  const current = sorted[currentIndex];
  const next = currentIndex >= 0 ? sorted[currentIndex + 1] : undefined;
  const xpIntoLevel = current ? xp - current.xpRequired : 0;

  if (!current || !next) {
    return { level, xpIntoLevel, xpRequiredForNextLevel: null, progressPercent: 100 };
  }

  const span = next.xpRequired - current.xpRequired;
  const progressPercent = span > 0 ? Math.min(100, (xpIntoLevel / span) * 100) : 100;
  return { level, xpIntoLevel, xpRequiredForNextLevel: span, progressPercent };
}
