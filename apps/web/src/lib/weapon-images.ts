// Thumbnails for the Top weapons panel, keyed by the Kill's raw `cause` tag
// (e.g. Id.Item.AK74M). Drop the file into apps/web/public/weapons and add
// its entry here; a weapon with no entry shows a placeholder.
const WEAPON_IMAGES: Record<string, string> = {};

/** The public URL of a weapon's thumbnail, or null when we have none. */
export function getWeaponImageUrl(cause: string): string | null {
  const file = WEAPON_IMAGES[cause];
  return file ? `/weapons/${file}` : null;
}
