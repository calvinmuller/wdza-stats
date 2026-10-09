"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CountryFlag } from "@/components/country-flag";
import { FactionScoreBar } from "@/components/faction-score-bar";
import { FactionSwatch } from "@/components/faction-swatch";
import { compactMoney } from "@/lib/format-cash";
import { formatTimeOfDay } from "@/lib/format-date";
import { subscribeToLiveSnapshot } from "@/lib/live-snapshot-stream";
import { getMapArtUrl } from "@/lib/map-art";
import { serverLiveOf, type ServerLive } from "@/lib/server-live";
import { serverPath } from "@/lib/server-path";

function ago(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

// "Xs ago" can only be worked out in the browser, so the server (and the
// browser's first render, to match it) shows the fixed time instead.
function UpdatedAt({ iso }: { iso: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const text =
    now === null
      ? formatTimeOfDay(iso)
      : ago(Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000)));
  return <span>updated {text}</span>;
}

/**
 * One Server on the home page, linking to its live dashboard. Follows the
 * Server's live stream, so the map, rotation and faction scores move as the
 * Worker stores each new Snapshot.
 */
export function HomeServerCard({ slug, name, initial }: { slug: string; name: string; initial: ServerLive | null }) {
  const [live, setLive] = useState(initial);
  const mapArtUrl = live ? getMapArtUrl(live.map, live.lighting) : null;

  useEffect(
    () => subscribeToLiveSnapshot(slug, (view) => setLive(serverLiveOf(view.snapshot, view.capturedAt))),
    [slug],
  );

  return (
    <Link
      href={serverPath(slug)}
      className="flex h-full flex-col gap-3 rounded-xl border border-white/10 bg-zinc-900/60 p-5 transition-colors hover:border-brand-gold-500/60"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-display text-xl text-zinc-50">{name}</span>
        {live && (
          <span className="shrink-0 text-sm text-zinc-400">
            <span className="text-zinc-200">
              {live.playerCount}/{live.maxPlayers}
            </span>{" "}
            online
          </span>
        )}
      </div>
      {live ? (
        <>
          {mapArtUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mapArtUrl}
              alt={`${live.map} - ${live.lighting}`}
              width={1920}
              height={149}
              className="h-auto min-h-8 w-full rounded-md object-cover object-center"
            />
          )}
          <div className="text-sm text-zinc-400">
            <p>
              Map: <span className="text-zinc-200">{live.map}</span>
            </p>
            {live.rotation && (
              <p>
                Rotation: <span className="text-zinc-200">{live.rotation.current}</span> &rarr;{" "}
                <span className="text-zinc-200">{live.rotation.next}</span>
              </p>
            )}
          </div>
          {live.factions.length > 0 && (
            <ul className="flex flex-col gap-3">
              {live.factions.map((faction) => (
                <li key={faction.name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center text-zinc-200">
                      <FactionSwatch color={faction.color} />
                      {faction.name}
                    </span>
                    <span className="text-zinc-200">{faction.score}</span>
                  </div>
                  <div className="mt-1.5">
                    <FactionScoreBar name={faction.name} color={faction.color} score={faction.score} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {live.players.length > 0 && (
            <div className="max-h-56 overflow-y-auto">
              <table className="w-full table-fixed text-sm">
                <thead className="sticky top-0 bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Online players</th>
                    <th className="w-9 px-2 py-1.5 text-right font-medium">K</th>
                    <th className="w-9 px-2 py-1.5 text-right font-medium">D</th>
                    <th className="w-14 px-2 py-1.5 text-right font-medium">Cash</th>
                    <th className="w-12 px-2 py-1.5 text-right font-medium">Ping</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {live.players.map((player) => (
                    <tr key={player.steamId}>
                      <td className="px-2 py-1">
                        <span className="flex min-w-0 items-center text-zinc-200">
                          {player.factionColor && <FactionSwatch color={player.factionColor} />}
                          <span className="truncate">{player.displayName}</span>
                          {player.countryCode && (
                            <span className="ml-1.5 shrink-0">
                              <CountryFlag countryCode={player.countryCode} />
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums text-zinc-200">{player.kills}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-zinc-400">{player.deaths}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-zinc-200">{compactMoney(player.cash)}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-zinc-500">{player.ping}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <span className="mt-auto text-xs text-zinc-500">
            <UpdatedAt iso={live.capturedAt} />
          </span>
        </>
      ) : (
        <span className="text-sm text-zinc-500">No live data yet</span>
      )}
    </Link>
  );
}
