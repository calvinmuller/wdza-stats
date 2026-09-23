"use client";

// Deep import, not the package root: the root barrel re-exports client.ts,
// which pulls in the `postgres` driver (Node-only, uses `fs`/`tls`/etc.) -
// that can't go in this Client Component's browser bundle.
import { getRotationPreview, SNAPSHOT_POLL_INTERVAL_MS } from "@wdza-stats/db/snapshot";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CashInPlayChart } from "@/components/cash-in-play-chart";
import { FactionSwatch } from "@/components/faction-swatch";
import { LightingBadge } from "@/components/lighting-badge";
import { getLightingInfo } from "@/lib/lighting";
import { getMapArtUrl } from "@/lib/map-art";
import { PlayerAvatar } from "@/components/player-avatar";
import { ActivityFeed } from "./activity-feed";
import { canStartKickVote, KickVoteHint, KickVotePanel, StartKickVoteButton } from "./kick-vote-panel";
import { SortableTable, type SortableColumn } from "@/components/sortable-table";
import type { KickVoteInitiator } from "@/lib/current-kick-vote-initiator";
import type { LiveSnapshotPlayer, LiveSnapshotView } from "@/lib/live-snapshot";

// No point refreshing faster than new Snapshots can actually arrive.
const FACTION_SCORE_LIMIT = 100;

export const REFRESH_INTERVAL_MS = SNAPSHOT_POLL_INTERVAL_MS;

// A fixed UTC hh:mm:ss, pinned to a locale/timeZone so the server (whatever
// it runs under) and the client always render identical text - avoids the
// hydration mismatch `Date.prototype.toLocaleTimeString()` would produce.
const capturedAtFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatCapturedAt(iso: string): string {
  return `${capturedAtFormatter.format(new Date(iso))} UTC`;
}

const FLIP_DURATION_MS = 350;

// Animates elements between renders using the FLIP technique: capture each
// element's position before the reorder, then compensate with an inverse
// transform and let it transition back to identity, so faction cards glide
// to their new rank instead of jumping there.
function useFlip(keys: string[]) {
  const elementsRef = useRef(new Map<string, HTMLElement>());
  const rectsRef = useRef(new Map<string, DOMRect>());

  useLayoutEffect(() => {
    const nextRects = new Map<string, DOMRect>();
    elementsRef.current.forEach((el, key) => {
      nextRects.set(key, el.getBoundingClientRect());
    });

    elementsRef.current.forEach((el, key) => {
      const prevRect = rectsRef.current.get(key);
      const nextRect = nextRects.get(key);
      if (!prevRect || !nextRect) return;

      const dx = prevRect.left - nextRect.left;
      const dy = prevRect.top - nextRect.top;
      if (dx === 0 && dy === 0) return;

      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = `transform ${FLIP_DURATION_MS}ms ease`;
        el.style.transform = "";
      });
    });

    rectsRef.current = nextRects;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join("|")]);

  return (key: string) => (el: HTMLElement | null) => {
    if (el) {
      elementsRef.current.set(key, el);
    } else {
      elementsRef.current.delete(key);
    }
  };
}

export function LiveServerView({
  initial,
  viewer,
}: {
  initial: LiveSnapshotView | null;
  /** Who may start a KickVote from this browser, or null - for the KickVote panel. */
  viewer: KickVoteInitiator | null;
}) {
  const [data, setData] = useState(initial);
  const [isActivityOpen, setIsActivityOpen] = useState(true);
  const [showAllPlayers, setShowAllPlayers] = useState(false);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch("/api/live-snapshot");
        if (response.ok) {
          setData(await response.json());
        }
      } catch {
        // Keep showing the last known-good Snapshot until the next poll succeeds.
      }
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  const TOP_PLAYERS_COUNT = 10;

  const sortedFactions = [...(data?.snapshot.factions ?? [])].sort(
    (a, b) => b.score - a.score,
  );
  const factionFlipRef = useFlip(sortedFactions.map((faction) => faction.name));

  if (!data) {
    return (
      <p className="text-zinc-400">
        No live data yet - waiting for the Worker&apos;s first poll.
      </p>
    );
  }

  const { serverId, serverName, capturedAt, snapshot, activeChallenges, recentNotifications, cashHistory, activeKickVote, staffSteamIds } = data;
  const rotation = getRotationPreview(snapshot.rotation);
  const playerCount = snapshot.players.length;
  const maxPlayers = snapshot.playerSlots.max;

  const mapArtUrl = getMapArtUrl(snapshot.map, snapshot.lighting);
  // Entries only carry lighting once the worker has captured /v1/rotation;
  // older snapshots have none, so the next map falls back to midday light.
  const nextEntries = snapshot.rotation.entries ?? [];
  const nextEntry =
    nextEntries.length > 0
      ? nextEntries[(snapshot.rotation.nowIndex + 1) % nextEntries.length]
      : undefined;
  const nextMapArtUrl = nextEntry
    ? getMapArtUrl(nextEntry.map, nextEntry.lighting ?? "DayClear", "720")
    : null;
  const lightingLabel = getLightingInfo(snapshot.lighting).label;
  const factionColorByName = new Map(
    snapshot.factions.map((faction) => [faction.name, faction.color]),
  );

  const playerColumns: SortableColumn<LiveSnapshotPlayer>[] = [
    {
      key: "displayName",
      label: "Player",
      value: (player) => player.displayName,
      cellClassName: "font-medium text-zinc-100",
      render: (player) => (
        <Link
          href={`/players/${player.steamId}`}
          className="flex items-center gap-2 hover:underline"
        >
          <PlayerAvatar avatarUrl={player.avatarUrl} size={24} />
          {player.displayName}
        </Link>
      ),
    },
    {
      key: "level",
      label: "Level",
      value: (player) => player.level ?? -1,
      numeric: true,
      render: (player) => player.level ?? "—",
    },
    {
      key: "faction",
      label: "Faction",
      value: (player) => player.faction,
      cellClassName: "text-zinc-400",
      render: (player) => (
        <span className="flex items-center">
          {factionColorByName.get(player.faction) && (
            <FactionSwatch color={factionColorByName.get(player.faction)!} />
          )}
          {player.faction}
        </span>
      ),
    },
    { key: "kills", label: "Kills", value: (player) => player.kills, numeric: true },
    { key: "deaths", label: "Deaths", value: (player) => player.deaths, numeric: true },
    { key: "cash", label: "Cash", value: (player) => player.cash, numeric: true },
    {
      key: "ping",
      label: "Ping",
      value: (player) => player.ping,
      numeric: true,
      cellClassName: "text-zinc-500",
    },
  ];

  // A KickVote row action only while none is active: KickVotePanel shows that one.
  const onlinePlayers = snapshot.players.map((player) => ({ steamId: player.steamId, displayName: player.displayName }));
  const kickVoteViewer = !activeKickVote && canStartKickVote(viewer, onlinePlayers) ? viewer : null;
  if (kickVoteViewer) {
    playerColumns.push({
      key: "kickVote",
      label: "",
      value: () => "",
      sortable: false,
      cellClassName: "text-right",
      render: (player) =>
        player.steamId === kickVoteViewer.steamId || staffSteamIds.includes(player.steamId) ? null : (
          <StartKickVoteButton serverId={serverId} target={player} />
        ),
    });
  }

  const sortedPlayers = [...snapshot.players].sort((a, b) => b.kills - a.kills);
  const visiblePlayers = showAllPlayers
    ? sortedPlayers
    : sortedPlayers.slice(0, TOP_PLAYERS_COUNT);

  return (
    <div className="flex flex-col items-start gap-6 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-8">
      <section className="rounded-xl border border-white/10 bg-zinc-900/60 p-6">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl">{serverName}</h1>
          <div className="flex items-center gap-4">
            <p className="whitespace-nowrap text-sm text-zinc-400">
              <span className="font-display text-lg text-zinc-50">
                {playerCount}/{maxPlayers}
              </span>{" "}
              players online
            </p>
            <button
              type="button"
              onClick={() => setIsActivityOpen((open) => !open)}
              title={isActivityOpen ? "Hide recent activity" : "Show recent activity"}
              aria-label={isActivityOpen ? "Hide recent activity" : "Show recent activity"}
              aria-pressed={isActivityOpen}
              className={`relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-zinc-200 hover:bg-zinc-800 ${
                isActivityOpen ? "bg-zinc-800" : "bg-zinc-800/60"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5"
                aria-hidden="true"
              >
                <path d="M6 8a6 6 0 0 1 12 0c0 4 1.5 6 2 6.5H4c.5-.5 2-2.5 2-6.5Z" />
                <path d="M10 18.5a2 2 0 0 0 4 0" />
              </svg>
              {recentNotifications.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-medium leading-none text-neutral-900">
                  {recentNotifications.length}
                </span>
              )}
            </button>
          </div>
        </div>
        {mapArtUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mapArtUrl}
            alt={`${snapshot.map} - ${lightingLabel}`}
            width={1920}
            height={149}
            className="mt-3 h-auto min-h-8 w-full rounded-md object-cover object-center"
          />
        )}
        <p className="mt-1 text-sm text-zinc-400">
          Map: <span className="text-zinc-200">{snapshot.map}</span>
          <span className="mx-2 text-zinc-600">&middot;</span>
          <LightingBadge lighting={snapshot.lighting} />
          <span className="mx-2 text-zinc-600">&middot;</span>
          Updated{" "}
          <time dateTime={capturedAt} className="text-zinc-200">
            {formatCapturedAt(capturedAt)}
          </time>
        </p>
        {rotation.current !== null && (
          <p className="mt-1 text-sm text-zinc-400">
            Rotation: <span className="text-zinc-200">{rotation.current}</span>{" "}
            (current) &rarr; <span className="text-zinc-200">{rotation.next}</span>{" "}
            (next)
          </p>
        )}
      </section>

      <KickVotePanel activeKickVote={activeKickVote} />

      <section>
        <h2 className="mb-3 text-xl">Factions</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {sortedFactions.map((faction, index) => (
            <li
              key={faction.name}
              ref={factionFlipRef(faction.name)}
              className={`rounded-lg border px-4 py-3 ${
                index === 0
                  ? "border-brand-gold-400/40 bg-brand-gold-400/10"
                  : "border-white/10 bg-zinc-900/60"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center text-sm font-medium text-zinc-200">
                  <span
                    className="mr-2 inline-block size-3 shrink-0 rounded-full ring-1 ring-white/20"
                    style={{ backgroundColor: faction.color }}
                    title={faction.color}
                  />
                  {faction.name}
                </span>
                <span className="font-display text-lg text-zinc-50">
                  {faction.score}
                </span>
              </div>
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={FACTION_SCORE_LIMIT}
                aria-valuenow={Math.min(faction.score, FACTION_SCORE_LIMIT)}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    backgroundColor: faction.color,
                    width: `${Math.min(100, Math.max(0, (faction.score / FACTION_SCORE_LIMIT) * 100))}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-xl">
          Online players{" "}
          <span className="text-sm font-normal text-zinc-500">
            ({playerCount}/{maxPlayers})
          </span>
        </h2>
        {!activeKickVote && playerCount > 0 && !kickVoteViewer && <KickVoteHint viewer={viewer} />}
        <SortableTable
          columns={playerColumns}
          rows={visiblePlayers}
          rowKey={(player) => player.steamId}
          defaultSort={{ column: "kills", direction: "desc" }}
          emptyMessage="No players online right now."
        />
        {playerCount > TOP_PLAYERS_COUNT && (
          <button
            type="button"
            onClick={() => setShowAllPlayers((open) => !open)}
            className="mt-3 text-sm text-zinc-400 underline decoration-dotted hover:text-zinc-200"
          >
            {showAllPlayers
              ? `Show top ${TOP_PLAYERS_COUNT}`
              : `Show all ${playerCount} players`}
          </button>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl">Today&apos;s challenges</h2>
        {activeChallenges.length === 0 ? (
          <p className="text-sm text-zinc-400">No active challenges right now.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {activeChallenges.map((challenge) => (
              <li
                key={challenge.instanceId}
                className="rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-3"
              >
                <p className="text-sm font-medium text-zinc-200">
                  {challenge.description}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  +{challenge.xpReward} XP &middot; {challenge.completedCount} completed
                  {challenge.participantCount > 0 && (
                    <> &middot; {challenge.participantCount} in progress</>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl">
          Cash in play{" "}
          <span className="text-sm font-normal text-zinc-500">
            held by connected players this match
          </span>
        </h2>
        <CashInPlayChart history={cashHistory} factions={snapshot.factions} />
      </section>
      </div>

      {isActivityOpen && (
        <aside className="w-full shrink-0 rounded-xl border border-white/10 bg-zinc-950 lg:sticky lg:top-6 lg:w-96">
          {nextMapArtUrl && (
            <figure className="relative overflow-hidden rounded-t-xl border-b border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={nextMapArtUrl}
                alt={`Next map: ${rotation.next}`}
                width={1280}
                height={720}
                className="aspect-video w-full object-cover"
              />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-2 pt-8 text-xs text-zinc-300">
                Next map: <span className="text-zinc-50">{rotation.next}</span>
              </figcaption>
            </figure>
          )}
          <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3">
            <h2 className="text-lg">Recent activity</h2>
            <button
              type="button"
              onClick={() => setIsActivityOpen(false)}
              aria-label="Close recent activity"
              className="rounded-lg px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              &times;
            </button>
          </div>
          <ActivityFeed
            notifications={recentNotifications}
            factionColors={Object.fromEntries(snapshot.factions.map((faction) => [faction.name, faction.color]))}
            linkableSteamIds={new Set(snapshot.players.filter((player) => player.level !== null).map((player) => player.steamId))}
          />
        </aside>
      )}
    </div>
  );
}
