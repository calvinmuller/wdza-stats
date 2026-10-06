import type { Season } from "@wdza-stats/db";
import Link from "next/link";
import {
  KILL_SCOPE_PARAMS,
  killScopeFor,
  killScopeLabel,
  killScopeParam,
  type KillScope,
} from "@/lib/kill-scope";

/**
 * Picks the span of Kills a page counts: the last 7 or 30 days, the current
 * Season, or all time. Every option is a link carrying a `window` query
 * value (resolved by resolveKillScope), so the choice is in the URL and can
 * be shared. Mirrors SeasonPicker; imports nothing from the database.
 */
export function KillScopePicker({
  current,
  selected,
  hrefFor,
}: {
  current: Season;
  selected: KillScope;
  hrefFor: (window: string) => string;
}) {
  const selectedParam = killScopeParam(selected);

  return (
    <nav aria-label="Window" className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
      <span className="mr-2 text-zinc-500">Showing</span>
      {KILL_SCOPE_PARAMS.map((param) => (
        <Link
          key={param}
          href={hrefFor(param)}
          aria-current={param === selectedParam ? "page" : undefined}
          className="rounded-full px-3 py-1 font-medium text-zinc-400 transition-colors hover:text-zinc-100 aria-[current=page]:bg-brand-green-700/40 aria-[current=page]:text-brand-gold-500"
        >
          {killScopeLabel(killScopeFor(param, current))}
        </Link>
      ))}
    </nav>
  );
}
