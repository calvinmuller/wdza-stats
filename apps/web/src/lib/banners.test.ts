import { describe, expect, it } from "vitest";
import { BANNER_PLACEMENTS, getBanner } from "./banners";

describe("getBanner", () => {
  it("shows every placement from this site's own /ads/ path when nothing is configured", () => {
    for (const placement of BANNER_PLACEMENTS) {
      const banner = getBanner(placement, {});
      expect(banner?.src).toMatch(/^\/ads\/gearup-/);
      expect(banner?.href).toBe("https://www.gearupbooster.com/?affid=aff69579744");
    }
  });

  it("shows only the placements listed in ADS_PLACEMENTS", () => {
    const env = { ADS_PLACEMENTS: "header, Content" };
    expect(getBanner("header", env)).not.toBeNull();
    expect(getBanner("content", env)).not.toBeNull();
    expect(getBanner("sidebar", env)).toBeNull();
  });

  it("shows nothing when ADS_PLACEMENTS names no placement", () => {
    for (const placement of BANNER_PLACEMENTS) {
      expect(getBanner(placement, { ADS_PLACEMENTS: "none" })).toBeNull();
    }
  });

  it("serves the image from ADS_ORIGIN so a DNS blocker can block that hostname", () => {
    expect(getBanner("content", { ADS_ORIGIN: "https://ads.example.com/" })?.src).toBe(
      "https://ads.example.com/ads/gearup-banner.png",
    );
  });

  it("links to ADS_CLICK_URL, ignoring anything that is not an http(s) URL", () => {
    expect(getBanner("header", { ADS_CLICK_URL: "https://example.com/?ref=wdza" })?.href).toBe(
      "https://example.com/?ref=wdza",
    );
    expect(getBanner("header", { ADS_CLICK_URL: "javascript:alert(1)" })?.href).toBe("https://www.gearupbooster.com/?affid=aff69579744");
  });
});
