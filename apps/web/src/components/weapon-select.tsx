"use client";

import type { ServerWeapon } from "@/lib/weapon-leaderboard";

/**
 * Picks which weapon the leaderboard ranks. A plain GET form so the choice
 * lands in the URL and works without JavaScript (the Show button); with it,
 * changing the select submits straight away.
 */
export function WeaponSelect({
  weapons,
  selected,
  windowParam,
}: {
  weapons: ServerWeapon[];
  selected: string;
  windowParam: string;
}) {
  return (
    <form action="/weapons" method="get" className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="window" value={windowParam} />
      <label htmlFor="weapon" className="mr-2 text-zinc-500">
        Weapon
      </label>
      <select
        id="weapon"
        name="weapon"
        defaultValue={selected}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 focus:border-brand-gold-500 focus:outline-none"
      >
        {weapons.map((weapon) => (
          <option key={weapon.slug} value={weapon.slug}>
            {weapon.weapon}
          </option>
        ))}
      </select>
      <noscript>
        <button
          type="submit"
          className="rounded-lg bg-brand-green-700 px-4 py-2 text-sm font-medium text-zinc-50 transition-colors hover:bg-brand-green-600"
        >
          Show
        </button>
      </noscript>
    </form>
  );
}
