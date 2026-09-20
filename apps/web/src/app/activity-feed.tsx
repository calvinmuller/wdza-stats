"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDateTime } from "@/lib/format-date";
import type { KillView } from "@/lib/recent-kills";
import type { RecentNotificationView } from "@/lib/recent-notifications";
import { KillLine, useKillFeed } from "./kill-feed";

const NOTIFICATION_PRIORITY_CLASSNAME: Record<
  RecentNotificationView["priority"],
  string
> = {
  high: "text-brand-gold-400",
  normal: "text-zinc-200",
  low: "text-zinc-400",
};

// Kills outnumber Notifications many times over on a busy Server, so the
// merged list can be narrowed to one kind.
type Filter = "all" | "kills" | "highlights";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "kills", label: "Kills" },
  { key: "highlights", label: "Highlights" },
];

const EMPTY_MESSAGE: Record<Filter, string> = {
  all: "Nothing has happened yet.",
  kills: "No kills yet.",
  highlights: "Nothing noteworthy has happened yet.",
};

// Both sources are already capped (20 Kills, 20 Notifications); this is the
// most the merged list ever shows.
const MAX_ITEMS = 40;

type Item =
  | { type: "kill"; key: string; at: number; order: number; kill: KillView }
  | {
      type: "notification";
      key: string;
      at: number;
      order: number;
      notification: RecentNotificationView;
    };

// The live page's activity feed: kills as the game reports them and the
// curated Notifications, in one list, newest first.
export function ActivityFeed({
  notifications,
  factionColors,
  linkableSteamIds,
}: {
  notifications: RecentNotificationView[];
  /** Faction name to its color, from the current Snapshot. */
  factionColors: Record<string, string>;
  /** Players who have a page, i.e. a career row to show. */
  linkableSteamIds: ReadonlySet<string>;
}) {
  const kills = useKillFeed();
  const [filter, setFilter] = useState<Filter>("all");

  const items: Item[] = [
    ...(filter === "highlights"
      ? []
      : kills.map((kill): Item => ({
          type: "kill",
          key: `kill-${kill.id}`,
          at: Date.parse(kill.receivedAt),
          order: kill.id,
          kill,
        }))),
    ...(filter === "kills"
      ? []
      : notifications.map((notification): Item => ({
          type: "notification",
          key: `notification-${notification.id}`,
          at: Date.parse(notification.timestamp),
          order: notification.id,
          notification,
        }))),
  ]
    // Kills from one batch share a timestamp, so the row id settles their order.
    .sort((a, b) => b.at - a.at || b.order - a.order)
    .slice(0, MAX_ITEMS);

  return (
    <>
      <div
        role="group"
        aria-label="Filter activity"
        className="flex gap-1.5 border-b border-white/10 px-4 py-2"
      >
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              filter === key
                ? "bg-zinc-700 text-zinc-50"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-4">
        {items.length === 0 ? (
          <p className="text-sm text-zinc-400">{EMPTY_MESSAGE[filter]}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) =>
              item.type === "kill" ? (
                <li key={item.key} className="px-1">
                  <KillLine
                    kill={item.kill}
                    factionColors={factionColors}
                    linkableSteamIds={linkableSteamIds}
                  />
                </li>
              ) : (
                <li
                  key={item.key}
                  className="flex flex-col gap-1 rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-2"
                >
                  {item.notification.steamId ? (
                    <Link
                      href={`/players/${item.notification.steamId}`}
                      className={`text-sm hover:underline ${NOTIFICATION_PRIORITY_CLASSNAME[item.notification.priority]}`}
                    >
                      {item.notification.message}
                    </Link>
                  ) : (
                    <span
                      className={`text-sm ${NOTIFICATION_PRIORITY_CLASSNAME[item.notification.priority]}`}
                    >
                      {item.notification.message}
                    </span>
                  )}
                  <time
                    dateTime={item.notification.timestamp}
                    className="whitespace-nowrap text-xs text-zinc-500"
                  >
                    {formatDateTime(item.notification.timestamp)}
                  </time>
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </>
  );
}
