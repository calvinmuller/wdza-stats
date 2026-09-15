// Match finalization's MVP calculation - see ticket 07 and CONTEXT.md's
// PlayerCareerStat entry. Config-driven via mvpFormulaWeights rather than a
// hardcoded formula, matching xp-engine.ts/level-engine.ts's own
// config-table precedent.

export interface MvpFormulaWeights {
  killWeight: number;
  deathWeight: number;
}

/** The slice of a Match participant's delta the MVP formula needs - see match-tracker.ts's PlayerDelta. */
export interface MvpCandidate {
  steamId: string;
  kills: number;
  deaths: number;
}

export interface MvpResult {
  steamId: string;
  score: number;
}

/**
 * One candidate's MVP score under the config-driven formula (seeded
 * default: kills x10 - deaths x5). Exported so both computeMvp and its
 * tests can share one definition of "score" rather than each reimplementing
 * the arithmetic.
 */
export function mvpScoreFor(candidate: MvpCandidate, weights: MvpFormulaWeights): number {
  return candidate.kills * weights.killWeight + candidate.deaths * weights.deathWeight;
}

/**
 * True when `challenger` should replace `incumbent` as the MVP. A strictly
 * higher score always wins; a tied score is broken - in order - by more
 * kills (the more aggressive performance), then fewer deaths, then
 * lexicographically-smaller steamId, so the result is fully deterministic
 * regardless of input order. The ticket leaves the tie-break rule to the
 * implementation; this is the one chosen and documented here.
 */
function beats(
  challenger: MvpCandidate,
  challengerScore: number,
  incumbent: MvpCandidate,
  incumbentScore: number,
): boolean {
  if (challengerScore !== incumbentScore) {
    return challengerScore > incumbentScore;
  }
  if (challenger.kills !== incumbent.kills) {
    return challenger.kills > incumbent.kills;
  }
  if (challenger.deaths !== incumbent.deaths) {
    return challenger.deaths < incumbent.deaths;
  }
  return challenger.steamId < incumbent.steamId;
}

/**
 * The MVP among a closed Match's participant deltas, per mvpScoreFor and
 * beats' tie-break rule above. Returns null for a Match that closed with no
 * observed participants - there's no one to be MVP of an empty roster.
 */
export function computeMvp(candidates: MvpCandidate[], weights: MvpFormulaWeights): MvpResult | null {
  if (candidates.length === 0) {
    return null;
  }

  let best = candidates[0];
  let bestScore = mvpScoreFor(best, weights);

  for (const candidate of candidates.slice(1)) {
    const score = mvpScoreFor(candidate, weights);
    if (beats(candidate, score, best, bestScore)) {
      best = candidate;
      bestScore = score;
    }
  }

  return { steamId: best.steamId, score: bestScore };
}
