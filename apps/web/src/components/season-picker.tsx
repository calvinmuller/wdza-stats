import type { Season } from "@wdza-stats/db";
import Link from "next/link";
import { seasonLabel, seasonScopeParam, type SeasonScope } from "@/lib/season-param";

/**
 * Picks which stats a page shows: the current Season, each past Season, or
 * Career. Every option is a link carrying a `season` query value (resolved
 * by resolveSeasonScope), so the choice is in the URL and can be shared.
 * `seasons` comes from listSeasons - newest, i.e. current, first. Safe to
 * render from a client component: it imports nothing from the database.
 */
export function SeasonPicker({
  seasons,
  selected,
  hrefFor,
}: {
  seasons: Season[];
  selected: SeasonScope;
  hrefFor: (season: string) => string;
}) {
  const options = [
    ...seasons.map((season) => ({
      param: seasonScopeParam({ kind: "season", season }),
      label: seasonLabel(season),
    })),
    { param: seasonScopeParam({ kind: "career" }), label: "Career" },
  ];
  const selectedParam = seasonScopeParam(selected);

  return (
    <nav aria-label="Season" className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
      <span className="mr-2 text-zinc-500">Season</span>
      {options.map((option) => (
        <Link
          key={option.param}
          href={hrefFor(option.param)}
          aria-current={option.param === selectedParam ? "page" : undefined}
          className="rounded-full px-3 py-1 font-medium text-zinc-400 transition-colors hover:text-zinc-100 aria-[current=page]:bg-brand-green-700/40 aria-[current=page]:text-brand-gold-500"
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}
