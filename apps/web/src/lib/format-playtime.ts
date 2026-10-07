// Steam reports playtime in minutes; leaderboards and profiles show whole
// hours, since a player's total is always large enough that minutes-level
// precision isn't meaningful.
export function formatPlaytimeHours(minutes: number): string {
  return `${Math.round(minutes / 60).toLocaleString("en-US")}h`;
}

// Time on one Server is measured from join/leave GameEvents in seconds;
// shown in hours to one decimal, since a single evening's play is often
// well under the next whole hour.
export function formatServerPlaytime(seconds: number): string {
  return `${(seconds / 3600).toFixed(1)} h`;
}
