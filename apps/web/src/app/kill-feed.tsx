"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { describeKill, type KillParty } from "@/lib/describe-kill";
import type { KillView } from "@/lib/recent-kills";

// Kept in step with RECENT_KILLS_LIMIT in lib/recent-kills, which the client
// bundle can't import (it pulls in the database driver).
const FEED_LENGTH = 20;

/**
 * The last few Kills, oldest first, then each new one the moment the game
 * reports it. Loads the recent Kills over plain HTTP, then follows the stream
 * from the newest of them. A stream that says "reset" has been left too far
 * behind to catch up, so it starts over the same way.
 */
export function useKillFeed(): KillView[] {
  const [kills, setKills] = useState<KillView[]>([]);

  useEffect(() => {
    let cancelled = false;
    let source: EventSource | null = null;

    async function start() {
      try {
        const response = await fetch("/api/live-kills");
        if (!response.ok || cancelled) return;
        const { kills: recent } = (await response.json()) as {
          kills: KillView[];
        };
        if (cancelled) return;
        setKills(recent);

        source = new EventSource(
          `/api/live-kills/stream?after=${recent.at(-1)?.id ?? 0}`,
        );
        source.addEventListener("kill", (event) => {
          const kill = JSON.parse(
            (event as MessageEvent<string>).data,
          ) as KillView;
          setKills((current) =>
            current.some((existing) => existing.id === kill.id)
              ? current
              : [...current, kill].slice(-FEED_LENGTH),
          );
        });
        source.addEventListener("reset", () => {
          source?.close();
          void start();
        });
      } catch {
        // The feed is an extra: the rest of the page carries on without it.
      }
    }

    void start();
    return () => {
      cancelled = true;
      source?.close();
    };
  }, []);

  return kills;
}

/** One Kill as a line of the feed: "X killed Y with an AK-74M", and so on. */
export function KillLine({
  kill,
  factionColors,
  linkableSteamIds,
}: {
  kill: KillView;
  /** Faction name to its color, from the current Snapshot. */
  factionColors: Record<string, string>;
  /** Players who have a page, i.e. a career row to show. */
  linkableSteamIds: ReadonlySet<string>;
}) {
  const line = describeKill(kill);

  const name = (party: KillParty) => {
    const color = party.faction ? factionColors[party.faction] : undefined;
    const label = party.name || "Unknown";
    const style = color ? { color } : undefined;
    return linkableSteamIds.has(party.steamId) ? (
      <Link
        href={`/players/${party.steamId}`}
        className="font-medium hover:underline"
        style={style}
      >
        {label}
      </Link>
    ) : (
      <span className="font-medium" style={style}>
        {label}
      </span>
    );
  };

  return (
    <span className="text-sm text-zinc-300">
      {line.killer ? (
        <>
          {name(line.killer)} {line.verb} {name(line.victim)}
          {line.weapon && <> with {line.weapon}</>}
        </>
      ) : (
        <>
          {name(line.victim)} {line.verb}
        </>
      )}
      {line.headshot && (
        <span className="ml-1.5 rounded bg-brand-gold-500/20 px-1 text-xs text-brand-gold-400">
          headshot
        </span>
      )}
      {line.distanceM !== null && (
        <span className="ml-1.5 text-xs text-zinc-500">{line.distanceM} m</span>
      )}
    </span>
  );
}
