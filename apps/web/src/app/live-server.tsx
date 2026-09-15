"use client";

// Deep import, not the package root: the root barrel re-exports client.ts,
// which pulls in the `postgres` driver (Node-only, uses `fs`/`tls`/etc.) -
// that can't go in this Client Component's browser bundle.
import { getRotationPreview, SNAPSHOT_POLL_INTERVAL_MS } from "@wdza-stats/db/snapshot";
import { useEffect, useMemo, useState } from "react";
import { FactionSwatch } from "@/components/faction-swatch";
import { LightingBadge } from "@/components/lighting-badge";
import { PlayerAvatar } from "@/components/player-avatar";
import { SortableTable, type SortableColumn } from "@/components/sortable-table";
import { formatDateTime } from "@/lib/format-date";
import type { LiveSnapshotPlayer, LiveSnapshotView } from "@/lib/live-snapshot";
import type { RecentNotificationView } from "@/lib/recent-notifications";

const NOTIFICATION_PRIORITY_CLASSNAME: Record<RecentNotificationView["priority"], string> = {
  high: "text-amber-400",
  normal: "text-zinc-200",
  low: "text-zinc-400",
};

// No point refreshing faster than new Snapshots can actually arrive.
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

export function LiveServerView({
  initial,
}: {
  initial: LiveSnapshotView | null;
}) {
  const [data, setData] = useState(initial);

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

  const factionColorByName = useMemo(
    () => new Map(data?.snapshot.factions.map((faction) => [faction.name, faction.color]) ?? []),
    [data],
  );

  const playerColumns: SortableColumn<LiveSnapshotPlayer>[] = [
    {
      key: "displayName",
      label: "Player",
      value: (player) => player.displayName,
      cellClassName: "font-medium text-zinc-100",
      render: (player) => (
        <span className="flex items-center gap-2">
          <PlayerAvatar avatarUrl={player.avatarUrl} size={24} />
          {player.displayName}
        </span>
      ),
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

  if (!data) {
    return (
      <p className="text-zinc-400">
        No live data yet - waiting for the Worker&apos;s first poll.
      </p>
    );
  }

  const { serverName, capturedAt, snapshot, activeChallenges, recentNotifications } = data;
  const rotation = getRotationPreview(snapshot.rotation);
  const playerCount = snapshot.players.length;
  const maxPlayers = snapshot.playerSlots.max;

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl border border-white/10 bg-zinc-900/60 p-6">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl">{serverName}</h1>
          <p className="whitespace-nowrap text-sm text-zinc-400">
            <span className="font-display text-lg text-zinc-50">
              {playerCount}/{maxPlayers}
            </span>{" "}
            players online
          </p>
        </div>
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

      <section>
        <h2 className="mb-3 text-xl">Factions</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {snapshot.factions.map((faction) => (
            <li
              key={faction.name}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-3"
            >
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
        <SortableTable
          columns={playerColumns}
          rows={snapshot.players}
          rowKey={(player) => player.steamId}
          defaultSort={{ column: "kills", direction: "desc" }}
          emptyMessage="No players online right now."
        />
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
        <h2 className="mb-3 text-xl">Recent activity</h2>
        {recentNotifications.length === 0 ? (
          <p className="text-sm text-zinc-400">Nothing noteworthy has happened yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recentNotifications.map((notification) => (
              <li
                key={notification.id}
                className="flex items-baseline justify-between gap-4 rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-2"
              >
                <span
                  className={`text-sm ${NOTIFICATION_PRIORITY_CLASSNAME[notification.priority]}`}
                >
                  {notification.message}
                </span>
                <time
                  dateTime={notification.timestamp}
                  className="whitespace-nowrap text-xs text-zinc-500"
                >
                  {formatDateTime(notification.timestamp)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
