import { currentSeason } from "@wdza-stats/db";
import { notFound } from "next/navigation";
import { KillScopePicker } from "@/components/kill-scope-picker";
import { WeaponThumbnail } from "@/components/player-weapons";
import { WeaponSelect } from "@/components/weapon-select";
import { getBannedSteamIds } from "@/lib/banned-players";
import { db } from "@/lib/db";
import { killScopeParam, killScopePhrase } from "@/lib/kill-scope";
import { resolveKillScope } from "@/lib/kill-scope-resolve";
import { requirePublicServer } from "@/lib/server-lookup";
import { serverPath } from "@/lib/server-path";
import {
  WEAPON_LEADERBOARD_SIZE,
  getWeaponLeaderboard,
  listServerWeapons,
  mostUsedWeapon,
  type ServerWeapon,
} from "@/lib/weapon-leaderboard";
import { WeaponLeaderboardTable } from "./weapon-leaderboard-table";

// A DB read via drizzle isn't a Request-time API, so Next won't otherwise
// know this route needs fresh data on every request - force it dynamic so
// visitors always see current totals.
export const dynamic = "force-dynamic";

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

export default async function WeaponsPage({
  params,
  searchParams,
}: {
  params: Promise<{ server: string }>;
  searchParams: Promise<{ weapon?: string; window?: string }>;
}) {
  const server = await requirePublicServer(db, params);
  const basePath = serverPath(server.slug);
  const { weapon: rawWeapon, window: rawWindow } = await searchParams;
  const scope = await resolveKillScope(db, rawWindow);
  if (!scope) notFound();

  const [current, bannedSteamIds] = await Promise.all([currentSeason(db), getBannedSteamIds(db)]);
  const weapons = await listServerWeapons(db, server.id, bannedSteamIds);

  const windowParam = killScopeParam(scope);
  const weaponsHref = (options: { window?: string; weapon?: string }) =>
    `${basePath}/weapons?${new URLSearchParams({
      window: options.window ?? windowParam,
      ...(options.weapon ? { weapon: options.weapon } : {}),
    })}`;

  if (weapons.length === 0) {
    // A weapon in the URL can't be one of this Server's: nothing has been
    // delivered for any.
    if (rawWeapon !== undefined) notFound();
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl">Weapons</h1>
        <KillScopePicker current={current} selected={scope} hrefFor={(window) => weaponsHref({ window })} />
        <p className="text-zinc-400">No kills recorded by the kill feed yet.</p>
      </div>
    );
  }

  let weapon: ServerWeapon;
  if (rawWeapon !== undefined) {
    const found = weapons.find((candidate) => candidate.slug === rawWeapon);
    if (!found) notFound();
    weapon = found;
  } else {
    // Nothing picked: the scope's most-used weapon, so the page is never
    // empty; failing that (a scope with no Kills) the first one listed.
    const cause = await mostUsedWeapon(db, server.id, scope, bannedSteamIds);
    weapon = weapons.find((candidate) => candidate.cause === cause) ?? weapons[0];
  }

  const board = await getWeaponLeaderboard(db, server.id, weapon.cause, scope, bannedSteamIds);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Weapons</h1>
      <KillScopePicker
        current={current}
        selected={scope}
        hrefFor={(window) => weaponsHref({ window, weapon: weapon.slug })}
      />
      <WeaponSelect weapons={weapons} selected={weapon.slug} windowParam={windowParam} basePath={basePath} />

      <section className="flex items-center gap-4 rounded-lg border border-white/10 bg-zinc-900/60 px-5 py-4">
        <WeaponThumbnail cause={weapon.cause} />
        <div className="min-w-0">
          <h2 className="font-display text-2xl text-zinc-50">{weapon.weapon}</h2>
          <p className="text-sm text-zinc-400">
            {plural(board.totalKills, "kill", "kills")} by {plural(board.playerCount, "player", "players")}{" "}
            {killScopePhrase(scope) === "yet" ? "all time" : killScopePhrase(scope)}
          </p>
        </div>
      </section>

      {board.rows.length === 0 ? (
        <p className="text-zinc-400">
          Nobody got a kill with the {weapon.weapon} {killScopePhrase(scope)}.
        </p>
      ) : (
        <WeaponLeaderboardTable rows={board.rows} basePath={basePath} />
      )}

      <p className="max-w-2xl text-xs text-zinc-500">
        Ranked by kills, then headshots. Shows the top {WEAPON_LEADERBOARD_SIZE} players. Only kills made after the
        server&apos;s live kill feed was turned on are counted
        {scope.kind === "window" && ", by the time the feed delivered them"}.
      </p>
    </div>
  );
}
