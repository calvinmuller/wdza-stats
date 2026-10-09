/** A Match is won by the first Faction to reach this score (see Faction in CONTEXT.md). */
export const FACTION_SCORE_LIMIT = 100;

/** How far a Faction's score has come towards winning the Match, in its own colour. */
export function FactionScoreBar({ name, color, score }: { name: string; color: string; score: number }) {
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-zinc-800"
      role="progressbar"
      aria-label={`${name} score`}
      aria-valuemin={0}
      aria-valuemax={FACTION_SCORE_LIMIT}
      aria-valuenow={Math.min(score, FACTION_SCORE_LIMIT)}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{
          backgroundColor: color,
          width: `${Math.min(100, Math.max(0, (score / FACTION_SCORE_LIMIT) * 100))}%`,
        }}
      />
    </div>
  );
}
