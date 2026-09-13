// A fixed locale/timeZone so the server and the client always render
// identical text for the same instant - avoids the hydration mismatch
// `Date.prototype.toLocaleString()` produces when the server's default
// locale differs from the browser's (e.g. "13/09/2026, 01:13" vs
// "9/13/2026, 1:13 AM").
const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function formatDateTime(iso: string): string {
  return `${dateTimeFormatter.format(new Date(iso))} UTC`;
}
