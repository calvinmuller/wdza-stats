import Link from "next/link";
import { PlayerAvatar } from "@/components/player-avatar";
import type { Podium, PodiumPlace } from "@/lib/podium";
import { PODIUM_SIZE } from "@/lib/podium";
import { seasonLabel } from "@/lib/season-param";

// Each place's accent, plinth height and desktop column: the classic
// 2 · 1 · 3, winner raised in the middle. On a phone they stack 1 · 2 · 3.
const PLACE_STYLE: Record<number, { accent: string; plinth: string; order: string; avatar: number }> = {
  1: { accent: "text-brand-gold-500 border-brand-gold-500/60", plinth: "sm:pt-0", order: "sm:order-2", avatar: 96 },
  2: { accent: "text-zinc-300 border-zinc-300/40", plinth: "sm:pt-10", order: "sm:order-1", avatar: 80 },
  3: { accent: "text-amber-700 border-amber-700/50", plinth: "sm:pt-16", order: "sm:order-3", avatar: 72 },
};

function PodiumStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center">
      <dt className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="text-sm text-zinc-200">{value}</dd>
    </div>
  );
}

function PodiumCard({ place }: { place: PodiumPlace }) {
  const style = PLACE_STYLE[place.place];
  return (
    <Link
      href={`/players/${encodeURIComponent(place.steamId)}`}
      className={`flex h-full flex-col items-center gap-2 rounded-xl border bg-zinc-900/60 p-5 text-center transition-colors hover:bg-zinc-900 ${style.accent}`}
    >
      <span className="font-display text-3xl">{place.place}</span>
      {place.avatarUrl ? (
        <PlayerAvatar avatarUrl={place.avatarUrl} size={style.avatar} />
      ) : (
        <span
          className="flex items-center justify-center rounded-full bg-zinc-800 text-2xl text-zinc-500 ring-1 ring-white/10"
          style={{ width: style.avatar, height: style.avatar }}
          aria-hidden="true"
        >
          {place.displayName.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="max-w-full truncate font-display text-xl text-zinc-50">{place.displayName}</span>
      <span className="text-xs text-zinc-400">Lv {place.level}</span>
      <span className="font-display text-2xl text-zinc-50">
        {place.xp.toLocaleString("en-US")} <span className="text-sm text-zinc-400">XP</span>
      </span>
      <dl className="grid w-full grid-cols-4 gap-1">
        <PodiumStat label="Kills" value={place.kills.toLocaleString("en-US")} />
        <PodiumStat label="Deaths" value={place.deaths.toLocaleString("en-US")} />
        <PodiumStat label="K/D" value={place.kd.toFixed(2)} />
        <PodiumStat label="Wins" value={place.matchesWon.toLocaleString("en-US")} />
      </dl>
    </Link>
  );
}

function EmptyPlinth({ place }: { place: number }) {
  const style = PLACE_STYLE[place];
  return (
    <div
      className={`flex h-full min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-zinc-900/30 p-5 ${style.accent}`}
    >
      <span className="font-display text-3xl">{place}</span>
      <span className="text-xs text-zinc-500">Up for grabs</span>
    </div>
  );
}

// A smaller card for the Runners-up: a row on a phone, a column from sm up.
function RunnerUpCard({ place }: { place: PodiumPlace }) {
  return (
    <Link
      href={`/players/${encodeURIComponent(place.steamId)}`}
      className="flex h-full items-center gap-3 rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 transition-colors hover:bg-zinc-900 sm:flex-col sm:gap-1 sm:p-3 sm:text-center"
    >
      <span className="w-5 font-display text-lg text-zinc-500 sm:w-auto">{place.place}</span>
      {place.avatarUrl ? (
        <PlayerAvatar avatarUrl={place.avatarUrl} size={40} />
      ) : (
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-500 ring-1 ring-white/10"
          aria-hidden="true"
        >
          {place.displayName.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-zinc-50 sm:max-w-full sm:flex-none">{place.displayName}</span>
      <span className="text-sm text-zinc-200">
        {place.xp.toLocaleString("en-US")} <span className="text-xs text-zinc-400">XP</span>
      </span>
      <span className="hidden text-xs text-zinc-500 sm:block">
        Lv {place.level} · K/D {place.kd.toFixed(2)}
      </span>
    </Link>
  );
}

/** The current Season's Podium and Runners-up (see CONTEXT.md), across every Server. */
export function HomePodium({ podium }: { podium: Podium }) {
  const places = Array.from({ length: PODIUM_SIZE }, (_, index) => index + 1);

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl">{seasonLabel(podium.season)}</h1>
      {podium.places.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-zinc-900/60 p-6 text-zinc-400">
          Season {podium.season.number} has just started — no matches played yet.
        </p>
      ) : (
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {places.map((number) => {
            const place = podium.places.find((each) => each.place === number);
            const style = PLACE_STYLE[number];
            return (
              <li key={number} className={`${style.order} ${style.plinth}`}>
                {place ? <PodiumCard place={place} /> : <EmptyPlinth place={number} />}
              </li>
            );
          })}
        </ol>
      )}
      {podium.runnersUp.length > 0 && (
        <ol start={PODIUM_SIZE + 1} className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          {podium.runnersUp.map((place) => (
            <li key={place.place}>
              <RunnerUpCard place={place} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
