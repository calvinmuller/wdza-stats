import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getWeaponImageUrl, WEAPON_IMAGES } from "./weapon-images";

const PUBLIC_DIR = fileURLToPath(new URL("../../public/", import.meta.url));

describe("getWeaponImageUrl", () => {
  it("serves a known weapon's art from public", () => {
    expect(getWeaponImageUrl("Id.Item.M4")).toBe("/weapons/m4.webp");
  });

  it("is null for a weapon with no art", () => {
    expect(getWeaponImageUrl("Id.Item.WEPN_026")).toBeNull();
  });

  it("only names files that exist", () => {
    const missing = Object.values(WEAPON_IMAGES).filter((file) => !existsSync(PUBLIC_DIR + file));
    expect(missing).toEqual([]);
  });
});
