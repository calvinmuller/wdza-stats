"use client";

import type { LiveSnapshotView } from "./live-snapshot";

// One EventSource on /api/live-snapshot/stream per Server per tab, shared by
// everything that follows that Server (the theme's lighting on every page,
// the Server's live dashboard) - so the dashboard holds one connection, not
// one each. Opened on a Server's first subscriber, closed when its last one
// leaves.

type Listener = (view: LiveSnapshotView) => void;

interface Stream {
  source: EventSource;
  listeners: Set<Listener>;
}

// Keyed by Server slug; "" is the default Server (no ?server= at all).
const streams = new Map<string, Stream>();

/**
 * Calls `listener` with every live view the stream pushes for the Server at
 * /servers/{serverSlug}, or the default Server when it's null. Returns the
 * unsubscribe.
 */
export function subscribeToLiveSnapshot(serverSlug: string | null, listener: Listener): () => void {
  const key = serverSlug ?? "";
  let stream = streams.get(key);
  if (!stream) {
    const query = serverSlug ? `?${new URLSearchParams({ server: serverSlug })}` : "";
    // EventSource reconnects on its own after a dropped connection.
    const source = new EventSource(`/api/live-snapshot/stream${query}`);
    const listeners = new Set<Listener>();
    source.addEventListener("update", (event) => {
      const view = JSON.parse((event as MessageEvent<string>).data) as LiveSnapshotView;
      listeners.forEach((each) => each(view));
    });
    stream = { source, listeners };
    streams.set(key, stream);
  }
  stream.listeners.add(listener);

  const current = stream;
  return () => {
    current.listeners.delete(listener);
    if (current.listeners.size === 0) {
      current.source.close();
      streams.delete(key);
    }
  };
}
