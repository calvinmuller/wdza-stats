"use client";

import type { LiveSnapshotView } from "./live-snapshot";

// One EventSource on /api/live-snapshot/stream per tab, shared by everything
// that follows the live Server (the theme's lighting on every page, the
// homepage dashboard) - so the homepage holds one connection, not one each.
// Opened on the first subscriber, closed when the last one leaves.

type Listener = (view: LiveSnapshotView) => void;

const listeners = new Set<Listener>();
let source: EventSource | null = null;

function onUpdate(event: MessageEvent<string>) {
  const view = JSON.parse(event.data) as LiveSnapshotView;
  listeners.forEach((listener) => listener(view));
}

/** Calls `listener` with every live view the stream pushes. Returns the unsubscribe. */
export function subscribeToLiveSnapshot(listener: Listener): () => void {
  listeners.add(listener);
  if (!source) {
    // EventSource reconnects on its own after a dropped connection.
    source = new EventSource("/api/live-snapshot/stream");
    source.addEventListener("update", onUpdate);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && source) {
      source.close();
      source = null;
    }
  };
}
