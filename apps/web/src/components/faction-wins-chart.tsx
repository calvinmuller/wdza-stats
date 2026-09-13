import type { FactionWins } from "@/lib/server-stats";

// Fixed categorical fallback (validated dark-mode order from the dataviz
// palette) for the rare Faction with no color in the current Snapshot -
// e.g. one that's been renamed or removed since it won a Match.
const FALLBACK_COLORS = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
];

const SIZE = 200;
const STROKE_WIDTH = 32;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SEGMENT_GAP_PX = 3;

interface Segment extends FactionWins {
  color: string;
  share: number;
}

export function FactionWinsChart({ factionWins }: { factionWins: FactionWins[] }) {
  const totalWins = factionWins.reduce((sum, row) => sum + row.wins, 0);

  if (totalWins === 0) {
    return (
      <p className="text-zinc-400">
        No Match has recorded a winning Faction yet.
      </p>
    );
  }

  const segments: Segment[] = factionWins.map((row, index) => ({
    ...row,
    color: row.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length],
    share: row.wins / totalWins,
  }));

  let cumulativePx = 0;

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        className="shrink-0"
        role="img"
        aria-label="Match wins by Faction"
      >
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          {segments.map((segment) => {
            const segmentLengthPx = segment.share * CIRCUMFERENCE;
            const visibleLengthPx =
              segments.length > 1
                ? Math.max(segmentLengthPx - SEGMENT_GAP_PX, 0)
                : segmentLengthPx;
            const dashOffset = -cumulativePx;
            cumulativePx += segmentLengthPx;

            return (
              <circle
                key={segment.faction}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={segment.color}
                strokeWidth={STROKE_WIDTH}
                strokeDasharray={`${visibleLengthPx} ${CIRCUMFERENCE - visibleLengthPx}`}
                strokeDashoffset={dashOffset}
              >
                <title>
                  {segment.faction}: {segment.wins} win
                  {segment.wins === 1 ? "" : "s"} ({Math.round(segment.share * 100)}%)
                </title>
              </circle>
            );
          })}
        </g>
        <text
          x={SIZE / 2}
          y={SIZE / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-zinc-400 text-xs uppercase tracking-wide"
        >
          {totalWins} match{totalWins === 1 ? "" : "es"}
        </text>
      </svg>

      <div className="flex flex-col gap-2">
        <ul className="flex flex-col gap-1.5 text-sm">
          {segments.map((segment) => (
            <li key={segment.faction} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: segment.color }}
                aria-hidden="true"
              />
              <span className="text-zinc-100">{segment.faction}</span>
              <span className="text-zinc-500">
                {segment.wins} ({Math.round(segment.share * 100)}%)
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
