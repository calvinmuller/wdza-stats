import {
  gameEvents,
  notifications,
  type Database,
  type NotificationPriority,
} from "@wdza-stats/db";
import { and, desc, eq } from "drizzle-orm";

// How many rows the dashboard's recent-events feed shows - a small, fixed
// window rather than paginated, matching the feed's "at a glance" purpose.
export const RECENT_NOTIFICATIONS_LIMIT = 20;

export interface RecentNotificationView {
  id: number;
  priority: NotificationPriority;
  message: string;
  timestamp: string;
  // Null for match-scoped Notifications (MatchStarted/MatchEnded), whose
  // triggering GameEvent carries no player. Lets the UI link the player's
  // name in the feed back to their profile when one exists.
  steamId: string | null;
}

/**
 * The Server's most recent Notification rows (ticket 10), most recent first -
 * the dashboard's recent-events feed. Reads the already-throttled/curated
 * `Notification` table rather than the raw GameEvent log, per ticket 14's
 * spec, so this never floods the page with every kill. Left-joins through to
 * the triggering GameEvent to surface its steamId, since Notification itself
 * carries no player column (see schema.ts's notifications doc comment).
 */
export async function getRecentNotifications(
  db: Database,
  serverId: number,
  limit: number = RECENT_NOTIFICATIONS_LIMIT,
): Promise<RecentNotificationView[]> {
  const rows = await db
    .select({
      id: notifications.id,
      priority: notifications.priority,
      message: notifications.message,
      timestamp: notifications.timestamp,
      steamId: gameEvents.steamId,
    })
    .from(notifications)
    .leftJoin(gameEvents, eq(gameEvents.id, notifications.eventId))
    .where(eq(notifications.serverId, serverId))
    .orderBy(desc(notifications.timestamp), desc(notifications.id))
    .limit(limit);

  return rows.map((row) => ({ ...row, timestamp: row.timestamp.toISOString() }));
}

/**
 * One player's own recent Notifications on the given Server, most recent
 * first - the player profile page's "recent events" list. Joins through to
 * the triggering GameEvent to filter by steamId, since Notification itself
 * carries no player column (see schema.ts's notifications doc comment).
 * Match-scoped Notifications (MatchStarted/MatchEnded, whose GameEvent has a
 * null steamId) never match any player and are naturally excluded, leaving
 * only this player's own milestones (level-ups, streaks, achievements,
 * challenge completions). Returns an empty list when the player has none.
 */
export async function getPlayerNotifications(
  db: Database,
  serverId: number,
  steamId: string,
  limit: number = RECENT_NOTIFICATIONS_LIMIT,
): Promise<RecentNotificationView[]> {
  const rows = await db
    .select({
      id: notifications.id,
      priority: notifications.priority,
      message: notifications.message,
      timestamp: notifications.timestamp,
      steamId: gameEvents.steamId,
    })
    .from(notifications)
    .innerJoin(gameEvents, eq(gameEvents.id, notifications.eventId))
    .where(and(eq(notifications.serverId, serverId), eq(gameEvents.steamId, steamId)))
    .orderBy(desc(notifications.timestamp), desc(notifications.id))
    .limit(limit);

  return rows.map((row) => ({ ...row, timestamp: row.timestamp.toISOString() }));
}
