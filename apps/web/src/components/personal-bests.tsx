import Link from "next/link";
import { StatPanel } from "@/components/stat-panel";
import { formatDateTime } from "@/lib/format-date";
import type { PersonalBest, PersonalBests } from "@/lib/personal-bests";

const ROWS: { label: string; pick: (bests: PersonalBests) => PersonalBest | null; value: (best: PersonalBest) => string }[] = [
  {
    label: "Most kills in a match",
    pick: (bests) => bests.mostKills,
    value: (best) => `${best.kills.toLocaleString("en-US")} ${best.kills === 1 ? "kill" : "kills"}`,
  },
  {
    label: "Best K/D in a match",
    pick: (bests) => bests.bestKd,
    value: (best) => `K/D ${best.kd.toFixed(2)} (${best.kills} to ${best.deaths})`,
  },
  {
    label: "Most cash in a match",
    pick: (bests) => bests.mostCash,
    value: (best) => `${best.cash.toLocaleString("en-US")} cash`,
  },
];

/** The player's best single-Match performances, each linking to its Match. */
export function PersonalBestsPanel({ bests, basePath }: { bests: PersonalBests; basePath: string }) {
  const rows = ROWS.flatMap((row) => {
    const best = row.pick(bests);
    return best ? [{ ...row, best }] : [];
  });

  return (
    <StatPanel title="Personal bests">
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-400">No completed matches yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-white/10">
          {rows.map(({ label, value, best }) => (
            <li key={label} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
                <Link href={`${basePath}/matches/${best.matchId}`} className="text-sm text-zinc-400 hover:text-zinc-100 hover:underline">
                  {best.map}
                  {best.experiences.length > 0 && ` on ${best.experiences.join(", ")}`}, {formatDateTime(best.endedAt)}
                </Link>
              </div>
              <p className="shrink-0 text-right font-semibold text-zinc-50">{value(best)}</p>
            </li>
          ))}
        </ul>
      )}
    </StatPanel>
  );
}
