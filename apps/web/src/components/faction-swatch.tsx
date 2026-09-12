export function FactionSwatch({ color }: { color: string }) {
  return (
    <span
      className="faction-swatch"
      style={{ backgroundColor: color }}
      title={color}
    />
  );
}
