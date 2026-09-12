export function FactionSwatch({ color }: { color: string }) {
  return (
    <span
      className="mr-2 inline-block size-3 shrink-0 rounded-full ring-1 ring-white/20"
      style={{ backgroundColor: color }}
      title={color}
    />
  );
}
