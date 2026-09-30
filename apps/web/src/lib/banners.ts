// Sponsor Banners - see CONTEXT.md's Banner entry and docs/adr/0009. Which
// creative fills each placement is fixed here; whether a placement shows, where
// its image is served from, and where a click lands are env vars, so an
// operator can change them without a code change.

export type BannerPlacement = "header" | "sidebar" | "content";

export const BANNER_PLACEMENTS: BannerPlacement[] = ["header", "sidebar", "content"];

export interface Banner {
  placement: BannerPlacement;
  src: string;
  href: string;
  alt: string;
  width: number;
  height: number;
}

// GearUP's affiliate link for this site.
const DEFAULT_CLICK_URL = "https://www.gearupbooster.com/?affid=aff69579744";

// Files live in apps/web/public/ads. The /ads/ path is deliberate: it is what
// browser ad blockers match on.
const CREATIVES: Record<BannerPlacement, { file: string; alt: string; width: number; height: number }> = {
  // Wordmark, shown small in the site header.
  header: { file: "gearup-logo.png", alt: "GearUP", width: 620, height: 160 },
  // Animated 3:2 rectangle, shown in the live page's sidebar.
  sidebar: { file: "gearup-rectangle.gif", alt: "GearUP - Less Lag. More Fun.", width: 900, height: 600 },
  // Wide strip, shown centered under the header, above every page's content.
  content: { file: "gearup-banner.png", alt: "GearUP - rated Excellent on Trustpilot", width: 1053, height: 244 },
};

// Reads ADS_PLACEMENTS, ADS_ORIGIN and ADS_CLICK_URL - see .env.example.
type BannerEnv = Record<string, string | undefined>;

function isEnabled(placement: BannerPlacement, env: BannerEnv): boolean {
  const configured = env.ADS_PLACEMENTS?.trim();
  if (!configured) return true;
  return configured
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .includes(placement);
}

function clickUrl(env: BannerEnv): string {
  const configured = env.ADS_CLICK_URL?.trim();
  return configured && /^https?:\/\//i.test(configured) ? configured : DEFAULT_CLICK_URL;
}

/** The Banner to show in a placement, or null when that placement is turned off. */
export function getBanner(placement: BannerPlacement, env: BannerEnv = process.env): Banner | null {
  if (!isEnabled(placement, env)) return null;
  const { file, ...creative } = CREATIVES[placement];
  const origin = env.ADS_ORIGIN?.trim().replace(/\/+$/, "") ?? "";
  return { placement, src: `${origin}/ads/${file}`, href: clickUrl(env), ...creative };
}
