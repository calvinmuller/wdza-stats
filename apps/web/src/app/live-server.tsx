"use client";

// Deep import, not the package root: the root barrel re-exports client.ts,
// which pulls in the `postgres` driver (Node-only, uses `fs`/`tls`/etc.) -
// that can't go in this Client Component's browser bundle.
import { getRotationPreview, SNAPSHOT_POLL_INTERVAL_MS } from "@wdza-stats/db/snapshot";
import { useEffect, useState } from "react";
import type { LiveSnapshotView } from "@/lib/live-snapshot";

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

  if (!data) {
    return <p>No live data yet - waiting for the Worker&apos;s first poll.</p>;
  }

  const { serverName, capturedAt, snapshot } = data;
  const rotation = getRotationPreview(snapshot.rotation);

  return (
    <>
      <h1>{serverName}</h1>
      <p>
        Map: {snapshot.map} &middot; Updated{" "}
        <time dateTime={capturedAt}>{formatCapturedAt(capturedAt)}</time>
      </p>

      {rotation.current !== null && (
        <p>
          Rotation: {rotation.current} (current) &rarr; {rotation.next} (next)
        </p>
      )}

      <h2>Factions</h2>
      <ul className="factions">
        {snapshot.factions.map((faction) => (
          <li key={faction.name}>
            <span
              className="faction-swatch"
              style={{ backgroundColor: faction.color }}
              title={faction.color}
            />
            {faction.name}: {faction.score}
          </li>
        ))}
      </ul>

      <h2>Online players</h2>
      <div className="players-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Faction</th>
              <th>Kills</th>
              <th>Deaths</th>
              <th>Cash</th>
              <th>Ping</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.players.map((player) => (
              <tr key={player.steamId}>
                <td>{player.displayName}</td>
                <td>{player.faction}</td>
                <td>{player.kills}</td>
                <td>{player.deaths}</td>
                <td>{player.cash}</td>
                <td>{player.ping}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
