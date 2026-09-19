// Map art mirrored into public/maps by scripts/fetch-artwork.sh. Folders are
// terrains, not map names: the RCON console picks the folder per map (e.g.
// Ozeti -> Europe). Add a map here when it shows up without art.
const MAP_TERRAIN: Record<string, "Kavkazi" | "Europe" | "NorthAmerica"> = {
  Ozeti: "Europe",
  // Some maps are named after their terrain folder.
  Kavkazi: "Kavkazi",
  Europe: "Europe",
  NorthAmerica: "NorthAmerica",
};

export type MapArtVariant = "square" | "wide" | "720";

/** Returns the public URL of the art for a map + lighting, or null when we have none. */
export function getMapArtUrl(
  map: string,
  lighting: string,
  variant: MapArtVariant = "wide",
): string | null {
  const terrain = MAP_TERRAIN[map];
  if (!terrain) return null;
  return `/maps/${terrain}/${lighting}-${variant}.webp`;
}
