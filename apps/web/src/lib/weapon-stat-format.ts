import type { WeaponStat } from "./weapon-stats";

// Client-safe formatting for WeaponStats: a type-only import, so both the
// server-rendered podium and the client weapon table can share it.

export function headshotPercent(stat: Pick<WeaponStat, "kills" | "headshots">): number {
  return stat.kills === 0 ? 0 : Math.round((stat.headshots / stat.kills) * 100);
}

export function formatMetres(metres: number | null): string {
  return metres === null ? "—" : `${metres} m`;
}
