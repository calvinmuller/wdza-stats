import { describe, expect, it } from "vitest";
import { describeKill } from "./describe-kill";
import type { KillView } from "./recent-kills";

function kill(overrides: Partial<KillView> = {}): KillView {
  return {
    id: 1,
    matchId: null,
    receivedAt: "2026-09-20T12:00:00.000Z",
    eventTime: 100,
    map: "Kavkazi",
    killerSteamId: "76561198000000001",
    killerName: "Alice",
    killerFaction: "Lonestar",
    victimSteamId: "76561198000000002",
    victimName: "Bob",
    victimFaction: "Valkyra",
    cause: "Id.Item.AK74M",
    distanceM: 20,
    headshot: false,
    suicide: false,
    tags: [],
    ...overrides,
  };
}

describe("describeKill", () => {
  it("describes a weapon kill with the weapon's display name", () => {
    expect(describeKill(kill())).toEqual({
      killer: {
        steamId: "76561198000000001",
        name: "Alice",
        faction: "Lonestar",
      },
      victim: { steamId: "76561198000000002", name: "Bob", faction: "Valkyra" },
      verb: "killed",
      weapon: "AK-74M",
      headshot: false,
      distanceM: null,
    });
  });

  // Display names as the game's own console lists them, one per kind of tag.
  it.each([
    ["Id.Item.A91", "A-91"],
    ["Id.Item.WEPN_029", "Galil"],
    ["Id.Item.RPG7", "RPG-7"],
    ["Id.Item.M67Grenade", "M67 grenade"],
    ["Id.Buildable.BarbedWire", "Barbed wire"],
    ["ID.Item.BuildTool.Hammer.Large", "Hammer (large)"],
    ["Vehicle.Variant.Land.Wheeled.Kodiak.MachineGun", "Kodiak (machine gun)"],
    ["Id.Vehicle.WeaponExtension.ROT_02.30mmCannon", "ROT 02 30 mm cannon"],
    ["Id.Vehicle.WeaponExtension.STN_03.MainBarrel", "STN 03 main gun"],
  ])("names %s as %s", (cause, name) => {
    expect(describeKill(kill({ cause })).weapon).toBe(name);
  });

  it("falls back to the tag itself for a weapon it has no display name for", () => {
    expect(describeKill(kill({ cause: "Id.Item.SomeNewGun" })).weapon).toBe(
      "SomeNewGun",
    );
  });

  it("turns underscores in a fallback weapon name into spaces", () => {
    expect(describeKill(kill({ cause: "Id.Item.Sniper_Rifle" })).weapon).toBe(
      "Sniper Rifle",
    );
  });

  it("names no weapon when the game sent no cause", () => {
    expect(describeKill(kill({ cause: null })).weapon).toBeNull();
  });

  it("passes a headshot through", () => {
    expect(describeKill(kill({ headshot: true })).headshot).toBe(true);
  });

  describe("distance", () => {
    it("is given in whole metres when far enough to be worth saying", () => {
      expect(describeKill(kill({ distanceM: 704.87 })).distanceM).toBe(705);
    });

    it("is left out at 100 m or less", () => {
      expect(describeKill(kill({ distanceM: 100 })).distanceM).toBeNull();
      expect(describeKill(kill({ distanceM: 100.4 })).distanceM).toBeNull();
      expect(describeKill(kill({ distanceM: 101 })).distanceM).toBe(101);
    });

    it("is left out when the game sent none", () => {
      expect(describeKill(kill({ distanceM: null })).distanceM).toBeNull();
    });
  });

  it("reads a suicide as the victim dying, with no killer, weapon or distance", () => {
    const line = describeKill(
      kill({
        suicide: true,
        killerSteamId: "76561198000000002",
        killerName: "Bob",
        distanceM: 500,
      }),
    );

    expect(line).toMatchObject({
      killer: null,
      verb: "died",
      weapon: null,
      distanceM: null,
    });
    expect(line.victim.name).toBe("Bob");
  });

  it("reads a fall as the victim falling", () => {
    const line = describeKill(
      kill({
        killerSteamId: null,
        killerName: null,
        killerFaction: null,
        cause: null,
        distanceM: null,
        tags: ["Falling"],
      }),
    );

    expect(line).toMatchObject({ killer: null, verb: "fell", weapon: null });
  });

  it("reads any other death with no killer as the victim dying", () => {
    const line = describeKill(
      kill({
        killerSteamId: null,
        killerName: null,
        cause: null,
        tags: ["VehicleExplosion"],
      }),
    );

    expect(line).toMatchObject({ killer: null, verb: "died" });
  });

  it.each(["RoadKill", "VehicleExplosion"])(
    "names a vehicle for a %s, whatever the cause",
    (tag) => {
      expect(describeKill(kill({ tags: [tag] })).weapon).toBe("a vehicle");
    },
  );
});
