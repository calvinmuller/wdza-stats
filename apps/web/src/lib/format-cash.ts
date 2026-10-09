// In-game cash in a narrow space (chart axis ticks, a home page card): whole
// thousands once it reaches four figures.
export function compactMoney(value: number): string {
  return value >= 1000 ? `$${Math.round(value / 1000)}k` : `$${value}`;
}
