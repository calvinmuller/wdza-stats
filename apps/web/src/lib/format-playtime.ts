// Steam reports playtime in minutes; leaderboards and profiles show whole
// hours, since a player's total is always large enough that minutes-level
// precision isn't meaningful.
export function formatPlaytimeHours(minutes: number): string {
  return `${Math.round(minutes / 60).toLocaleString("en-US")}h`;
}
