import { weaponName } from "./describe-kill";

/**
 * How a weapon is named in a URL: its display name lowercased with runs of
 * anything else collapsed to a hyphen, so "AK74" is `ak74` and "Humvee M249"
 * is `humvee-m249`. Only ever resolved back to a cause tag against a Server's
 * own weapon list, never parsed.
 */
export function weaponSlug(cause: string): string {
  return (weaponName(cause) ?? cause)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
