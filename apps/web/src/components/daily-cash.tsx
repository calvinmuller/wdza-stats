import { StatPanel } from "@/components/stat-panel";
import type { DailyCash } from "@/lib/daily-cash";

const dayFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * Cash the player earned on each of their recent days of play, newest first,
 * with a bar scaled to their best day. `days` comes from getPlayerDailyCash.
 */
export function DailyCashPanel({ days }: { days: DailyCash[] }) {
  const best = Math.max(1, ...days.map((day) => day.cash));

  return (
    <StatPanel title="Cash per day">
      {days.length === 0 ? (
        <p className="text-sm text-zinc-400">No completed matches yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {days.map((day) => (
            <li key={day.day} className="grid grid-cols-[8.5rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[10rem_1fr_auto]">
              <span className="text-zinc-400">{dayFormatter.format(new Date(`${day.day}T00:00:00.000Z`))}</span>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-brand-gold-500"
                  style={{ width: `${(Math.max(0, day.cash) / best) * 100}%` }}
                />
              </div>
              <span className="text-right">
                <span className="font-semibold text-zinc-50">{day.cash.toLocaleString("en-US")} cash</span>{" "}
                <span className="text-xs text-zinc-500">
                  in {day.matches} {day.matches === 1 ? "match" : "matches"}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-zinc-500">Days are in UTC; a match counts towards the day it ended.</p>
    </StatPanel>
  );
}
