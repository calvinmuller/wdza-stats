import type { CashHistoryPoint } from "@/lib/cash-history";

const WIDTH = 1000;
const HEIGHT = 240;
const PAD = { top: 12, right: 16, bottom: 24, left: 48 };
const TOTAL_COLOR = "#d4a340";

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const money = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;

function compactMoney(value: number): string {
  return value >= 1000 ? `$${Math.round(value / 1000)}k` : `$${value}`;
}

// Round the axis max up to a "nice" 1/2/5 x 10^n so gridlines land on clean values.
function niceMax(value: number): number {
  if (value <= 0) return 1000;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((m) => value <= m * magnitude)!;
  return step * magnitude;
}

export function CashInPlayChart({
  history,
  factions,
}: {
  history: CashHistoryPoint[];
  factions: { name: string; color: string }[];
}) {
  if (history.length < 2) {
    return (
      <p className="text-sm text-zinc-400">
        Not enough data yet - the chart fills in as the match is observed.
      </p>
    );
  }

  const series = [
    {
      name: "Total",
      color: TOTAL_COLOR,
      value: (p: CashHistoryPoint) => p.total,
    },
    ...factions.map((faction) => ({
      name: faction.name,
      color: faction.color,
      value: (p: CashHistoryPoint) => p.byFaction[faction.name] ?? 0,
    })),
  ];

  const times = history.map((p) => new Date(p.capturedAt).getTime());
  const t0 = times[0];
  const t1 = times[times.length - 1];
  const yMax = niceMax(Math.max(...history.map((p) => p.total)));
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + ((t - t0) / Math.max(1, t1 - t0)) * plotW;
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;

  const latest = history[history.length - 1];
  const yTicks = [0, 1, 2, 3, 4].map((i) => (yMax / 4) * i);
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => t0 + (t1 - t0) * f);

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-2 text-xs uppercase tracking-wide">
        {series.map((s) => (
          <li
            key={s.name}
            className="flex items-center gap-2 rounded-md border border-white/10 bg-zinc-900/60 px-3 py-1.5 text-zinc-200"
          >
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: s.color }}
              aria-hidden="true"
            />
            {s.name}{" "}
            <span className="text-zinc-400">{money(s.value(latest))}</span>
          </li>
        ))}
      </ul>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Cash held by connected players this match"
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-white/10"
            />
            <text
              x={PAD.left - 8}
              y={y(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-zinc-500 text-[11px]"
            >
              {compactMoney(tick)}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <text
            key={tick}
            x={x(tick)}
            y={HEIGHT - 6}
            textAnchor="middle"
            className="fill-zinc-500 text-[11px]"
          >
            {timeFormatter.format(new Date(tick))}
          </text>
        ))}
        {series.map((s) => (
          <polyline
            key={s.name}
            fill="none"
            stroke={s.color}
            strokeWidth={s.name === "Total" ? 2 : 1.5}
            strokeLinejoin="round"
            points={history
              .map((p, i) => `${x(times[i]).toFixed(1)},${y(s.value(p)).toFixed(1)}`)
              .join(" ")}
          />
        ))}
      </svg>
    </div>
  );
}
