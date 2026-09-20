import type { KillView } from "./recent-kills";

// What one line of the live kill feed says, as parts the page can lay out with
// links and Faction colours. Kill is defined in CONTEXT.md.

export interface KillParty {
  steamId: string;
  name: string;
  faction: string | null;
}

export interface KillLine {
  /** Null when nobody else did it: a suicide or the environment. */
  killer: KillParty | null;
  victim: KillParty;
  verb: "killed" | "died" | "fell";
  /** A display name, or null when the game named none. */
  weapon: string | null;
  headshot: boolean;
  /** Whole metres, only when far enough to be worth saying. */
  distanceM: number | null;
}

// The game sends raw item tags; these are the display names its own console
// gives them. Anything not listed falls back to its own tag, so a new weapon
// still renders.
const WEAPON_NAMES: Record<string, string> = {
  "Id.Item.A91": "A-91",
  "Id.Item.AK74M": "AK-74M",
  "Id.Buildable.BarbedWire": "Barbed wire",
  "Id.Buildable.BremmerWall": "Bremer wall",
  "Id.Item.C4Explosive": "C4",
  "Id.Item.CombatBow": "Combat bow",
  "Id.Item.Defibrillator.Standard": "Defibrillator",
  "Id.Item.WEPN_029": "Galil",
  "Id.Item.Glock17": "Glock 17",
  "ID.Item.BuildTool.Hammer.Large": "Hammer (large)",
  "ID.Item.BuildTool.Hammer.Medium": "Hammer (medium)",
  "Id.Item.KH2002": "KH2002",
  "Vehicle.Variant.Land.Wheeled.Kodiak.MachineGun": "Kodiak (machine gun)",
  "Vehicle.Variant.Land.Wheeled.Kodiak.Pickup": "Kodiak pickup",
  "Vehicle.Variant.Air.Rotary.Littlebird.MountedMachineGuns": "Littlebird (mounted MGs)",
  "Vehicle.Variant.Land.Tracked.SpawnVehicle.Lonestar": "Lonestar",
  "Id.Item.M4": "M4",
  "Id.Item.M500": "M500",
  "Id.Item.M67Grenade": "M67 grenade",
  "Id.Item.MK22": "MK 22",
  "Id.Item.MP43": "MP43",
  "Id.Vehicle.WeaponExtension.ROT_02.122mm": "ROT 02 122 mm",
  "Id.Vehicle.WeaponExtension.ROT_02.30mmCannon": "ROT 02 30 mm cannon",
  "Id.Vehicle.WeaponExtension.ROT_03.MountedMachineGun": "ROT 03 mounted MG",
  "Id.Item.RPG7": "RPG-7",
  "Id.Item.SKS": "SKS",
  "Id.Vehicle.WeaponExtension.STN_01.MistralAA": "STN 01 Mistral AA",
  "Id.Vehicle.WeaponExtension.STN_02.MainCannon": "STN 02 main cannon",
  "Id.Vehicle.WeaponExtension.STN_03.MainBarrel": "STN 03 main gun",
  "Id.Vehicle.WeaponExtension.WHL_02.SUV.RingTurret": "SUV ring turret",
  "Id.Item.SV98": "SV-98",
  "Id.Item.SVDM": "SVDM",
  "Id.Item.TAR21": "TAR-21",
};

function weaponName(cause: string | null): string | null {
  if (!cause) return null;
  return (
    WEAPON_NAMES[cause] ?? cause.replace(/^Id\.Item\./, "").replaceAll("_", " ")
  );
}

const VEHICLE_TAGS = ["RoadKill", "VehicleExplosion"];
// Closer than this is the normal case for a firefight; only longer shots are worth a number.
const NOTABLE_DISTANCE_M = 100;

export function describeKill(kill: KillView): KillLine {
  const victim = {
    steamId: kill.victimSteamId,
    name: kill.victimName,
    faction: kill.victimFaction,
  };
  const base = { victim, headshot: kill.headshot };

  if (kill.suicide || !kill.killerSteamId) {
    const fell = !kill.suicide && kill.tags.includes("Falling");
    return {
      ...base,
      killer: null,
      verb: fell ? "fell" : "died",
      weapon: null,
      distanceM: null,
    };
  }

  const metres = kill.distanceM === null ? null : Math.round(kill.distanceM);
  return {
    ...base,
    killer: {
      steamId: kill.killerSteamId,
      name: kill.killerName ?? "",
      faction: kill.killerFaction,
    },
    verb: "killed",
    weapon: kill.tags.some((tag) => VEHICLE_TAGS.includes(tag))
      ? "a vehicle"
      : weaponName(kill.cause),
    distanceM: metres !== null && metres > NOTABLE_DISTANCE_M ? metres : null,
  };
}
