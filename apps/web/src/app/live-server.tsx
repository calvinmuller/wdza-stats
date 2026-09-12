"use client";

// Deep import, not the package root: the root barrel re-exports client.ts,
// which pulls in the `postgres` driver (Node-only, uses `fs`/`tls`/etc.) -
// that can't go in this Client Component's browser bundle.
import { getRotationPreview, SNAPSHOT_POLL_INTERVAL_MS } from "@wdza-stats/db/snapshot";
import type { SnapshotPlayer } from "@wdza-stats/db/snapshot";
import { useEffect, useMemo, useState } from "react";
import { FactionSwatch } from "@/components/faction-swatch";
import type { LiveSnapshotView } from "@/lib/live-snapshot";

type PlayerSortColumn = "displayName" | "faction" | "kills" | "deaths" | "cash" | "ping";

const PLAYER_COLUMNS: { key: PlayerSortColumn; label: string }[] = [
  { key: "displayName", label: "Player" },
  { key: "faction", label: "Faction" },
  { key: "kills", label: "Kills" },
  { key: "deaths", label: "Deaths" },
  { key: "cash", label: "Cash" },
  { key: "ping", label: "Ping" },
];

const TEXT_COLUMNS = new Set<PlayerSortColumn>(["displayName", "faction"]);

function sortPlayers(
  players: SnapshotPlayer[],
  column: PlayerSortColumn,
  direction: "asc" | "desc",
): SnapshotPlayer[] {
  const sorted = [...players].sort((a, b) => {
    const [left, right] = [a[column], b[column]];
    if (typeof left === "string" || typeof right === "string") {
      return String(left).localeCompare(String(right));
    }
    return left - right;
  });
  return direction === "asc" ? sorted : sorted.reverse();
}

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
  const [sort, setSort] = useState<{ column: PlayerSortColumn; direction: "asc" | "desc" }>({
    column: "kills",
    direction: "desc",
  });

  function toggleSort(column: PlayerSortColumn) {
    setSort((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { column, direction: TEXT_COLUMNS.has(column) ? "asc" : "desc" },
    );
  }

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

  const sortedPlayers = useMemo(
    () => (data ? sortPlayers(data.snapshot.players, sort.column, sort.direction) : []),
    [data, sort],
  );

  const factionColorByName = useMemo(
    () => new Map(data?.snapshot.factions.map((faction) => [faction.name, faction.color]) ?? []),
    [data],
  );

  if (!data) {
    return (
      <p className="text-zinc-400">
        No live data yet - waiting for the Worker&apos;s first poll.
      </p>
    );
  }

  const { serverName, capturedAt, snapshot } = data;
  const rotation = getRotationPreview(snapshot.rotation);

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl border border-white/10 bg-zinc-900/60 p-6">
        <h1 className="text-3xl">{serverName}</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Map: <span className="text-zinc-200">{snapshot.map}</span>
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
        <h2 className="mb-3 text-xl">Online players</h2>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
                {PLAYER_COLUMNS.map((column) => (
                  <th key={column.key} className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className="flex items-center gap-1 uppercase tracking-wide text-zinc-500 hover:text-zinc-200"
                    >
                      {column.label}
                      {sort.column === column.key && (
                        <span className="text-brand-gold-500">
                          {sort.direction === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sortedPlayers.map((player) => (
                <tr key={player.steamId} className="hover:bg-white/5">
                  <td className="px-4 py-2.5 font-medium text-zinc-100">
                    {player.displayName}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-400">
                    <span className="flex items-center">
                      {factionColorByName.get(player.faction) && (
                        <FactionSwatch color={factionColorByName.get(player.faction)!} />
                      )}
                      {player.faction}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-300">{player.kills}</td>
                  <td className="px-4 py-2.5 text-zinc-300">{player.deaths}</td>
                  <td className="px-4 py-2.5 text-zinc-300">{player.cash}</td>
                  <td className="px-4 py-2.5 text-zinc-500">{player.ping}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
