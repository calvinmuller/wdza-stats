"use client";

import { useState } from "react";
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
  const [hovered, setHovered] = useState<number | null>(null);

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

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const viewX = ((event.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    for (let i = 1; i < times.length; i++) {
      if (Math.abs(x(times[i]) - viewX) < Math.abs(x(times[nearest]) - viewX)) {
        nearest = i;
      }
    }
    setHovered(nearest);
  }

  const hoveredPoint = hovered === null ? null : history[Math.min(hovered, history.length - 1)];
  const hoveredX = hoveredPoint ? x(times[history.indexOf(hoveredPoint)]) : 0;
  const yTicks = [0, 1, 2, 3, 4].map((i) => (yMax / 4) * i);
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => t0 + (t1 - t0) * f);

  return (
    <div className="relative">
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
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHovered(null)}
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
        {hoveredPoint && (
          <g pointerEvents="none">
            <line
              x1={hoveredX}
              x2={hoveredX}
              y1={PAD.top}
              y2={PAD.top + plotH}
              className="stroke-white/30"
            />
            {series.map((s) => (
              <circle
                key={s.name}
                cx={hoveredX}
                cy={y(s.value(hoveredPoint))}
                r={3.5}
                fill={s.color}
              />
            ))}
          </g>
        )}
      </svg>
      {hoveredPoint && (
        <div
          className="pointer-events-none absolute top-10 z-10 min-w-40 rounded-md border border-white/10 bg-zinc-950/95 px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${(hoveredX / WIDTH) * 100}%`,
            transform: `translateX(${hoveredX > WIDTH / 2 ? "calc(-100% - 12px)" : "12px"})`,
          }}
        >
          <p className="mb-1 text-zinc-400">
            {timeFormatter.format(new Date(hoveredPoint.capturedAt))} UTC
          </p>
          {series.map((s) => (
            <p key={s.name} className="flex items-center justify-between gap-4 text-zinc-200">
              <span className="flex items-center gap-2">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                  aria-hidden="true"
                />
                {s.name}
              </span>
              <span>{money(s.value(hoveredPoint))}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
