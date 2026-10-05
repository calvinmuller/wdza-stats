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

// The game sends raw item tags and no display names; these are the names the
// game's own menus give them. Anything not listed falls back to its own tag, so
// a new weapon still renders.
const WEAPON_NAMES: Record<string, string> = {
  // Firearms and launchers, as the game's weapon list names them. Vector, RFB
  // and LMG_02 by calibre and class: the only .45 SMG, the only semi-automatic
  // .308, the other LMG.
  "Id.Item.A91": "A-91",
  "Id.Item.KH2002": "KH-2002",
  "Id.Item.TAR21": "T-21",
  "Id.Item.AK74M": "AK74",
  "Id.Item.WEPN_029": "Galil",
  "Id.Item.M4": "M4",
  "Id.Item.MP9": "AMP-9",
  "Id.Item.Vector": "Super-45",
  "Id.Item.MP43": "MP43",
  "Id.Item.M500": "M500",
  "Id.Item.M249": "M249 SAW",
  "Id.Item.LMG_02": "PKM",
  "Id.Item.SKS": "SKS",
  "Id.Item.SVDM": "SVD",
  "Id.Item.RFB": "BMR-308",
  "Id.Item.Mosin": "Mosin Nagant",
  "Id.Item.SV98": "SV98",
  "Id.Item.MK22": "MK22",
  "Id.Item.CombatBow": "Compound bow",
  "Id.Item.Glock17": "GGX 17",
  "Id.Item.Judge": "Judge",
  "Id.Item.RPG7": "RPG-7",
  "Id.Item.CGM4": "MAAWS",
  "Id.Item.MMGL": "MGL-40",
  // No name known: the tag's own words
  "Id.Item.Launcher_04": "Launcher 04",
  "Id.Item.SMG_03": "SMG 03",
  "Id.Item.SR_04": "SR 04",
  "Id.Item.WEPN_026": "WEPN 026",
  "Id.Item.WEPN_027": "WEPN 027",
  "Id.Item.WEPN_028": "WEPN 028",
  "Id.Item.WEPN_030": "WEPN 030",
  "Id.Item.WEPN_032": "WEPN 032",
  "Id.Item.WEPN_033": "WEPN 033",
  "Id.Item.WEPN_035": "WEPN 035",
  // Explosives and tools
  "Id.Item.M67Grenade": "M67 frag grenade",
  "Id.Item.C4Explosive": "C4 charge",
  "Id.Item.IED.Explosive": "IED",
  "Id.Item.ATMine": "AT mine",
  "Id.Item.Claymore": "Claymore",
  "Id.Item.Crowbar": "Halligan bar",
  "Id.Item.Fists": "Fists",
  "Id.Item.Defibrillator.Standard": "Defibrillator",
  "ID.Item.BuildTool.Hammer.Large": "Large hammer",
  "ID.Item.BuildTool.Hammer.Medium": "Medium hammer",
  "ID.Item.BuildTool.Hammer.Small": "Small hammer",
  "ID.Item.RepairTool.Drill.Light": "Light drill",
  "ID.Item.RepairTool.Drill.Heavy": "Heavy drill",
  "ID.Item.SmokeGrenade.White": "White smoke grenade",
  "Id.Item.VehicleSupplyCrate.Pallet.MunitionsSupply": "Ammo supply pallet",
  // Buildables
  "Id.Buildable.BremmerWall": "Bremer wall",
  "Id.Buildable.BarbedWire": "Barbed wire",
  "Id.Buildable.HBlock": "H-block",
  "Id.Buildable.TallHBlock": "Tall H-block",
  // Vehicles: the crew's guns or a roadkill
  "Vehicle.Variant.Air.Rotary.Littlebird.Default": "MH-6",
  "Vehicle.Variant.Air.Rotary.Littlebird.MountedMachineGuns": "AH-6M",
  "Vehicle.Variant.Air.Rotary.Littlebird.RocketPods": "AH-6R",
  "Vehicle.Variant.Air.Rotary.Havoc.Default": "Havoc",
  "Vehicle.Variant.Air.Rotary.ROT_04.Default": "Z20 Lakota",
  "Vehicle.Variant.Air.Rotary.ROT_04.MountedMachineGuns": "Z20 Lakota (miniguns)",
  "Vehicle.Variant.Land.Tracked.TNK_01.AntiAir": "Flakpanzer Gepard",
  "Vehicle.Variant.Land.Tracked.TNK_01.Heavy": "L2A6",
  "Vehicle.Variant.Land.Tracked.TNK_01.Artillery": "SPH-2",
  "Vehicle.Variant.Land.Tracked.SpawnVehicle.Lonestar": "M113 APC",
  "Vehicle.Variant.Land.Tracked.SpawnVehicle.Valkyra": "M113 APC",
  "Vehicle.Variant.Land.Tracked.SpawnVehicle.Manticore": "M113 APC",
  "Vehicle.Variant.Land.Wheeled.Humvee.Default": "Humvee",
  "Vehicle.Variant.Land.Wheeled.Humvee.MachineGun": "Humvee (M249)",
  "Vehicle.Variant.Land.Wheeled.Humvee.Minigun": "Humvee (minigun)",
  "Vehicle.Variant.Land.Wheeled.Kodiak.Default": "Kodiak",
  "Vehicle.Variant.Land.Wheeled.Kodiak.MachineGun": "Kodiak (M249)",
  "Vehicle.Variant.Land.Wheeled.Kodiak.Pickup": "Kodiak (pickup)",
  "Vehicle.Variant.Land.Wheeled.Ural.Default": "Ural",
  "Vehicle.Variant.Land.Wheeled.Ural.Battle": "Ural Defender",
  "Vehicle.Variant.Land.Wheeled.Ural.Attack": "Ural Defender (M249)",
  "Vehicle.Variant.Land.Wheeled.Bobcat.Default": "Bobcat",
  "Vehicle.Variant.Land.Wheeled.DuneBuggy.Default": "Dune buggy",
  "Vehicle.Variant.Stationary.Phalanx": "Vanguard CIWS",
  "Vehicle.Variant.Stationary.Mortar": "L81 mortar",
  "Vehicle.Variant.Stationary.MistralAA": "Talon 9K-SAM",
  "Vehicle.Variant.Stationary.STN_05": "STN 05",
  "Vehicle.Variant.Stationary.Loudspeaker": "Loudspeaker",
  // Vehicle weapons
  "Id.Vehicle.WeaponExtension.ROT_02.30mmCannon": "Havoc 2A42 autocannon",
  "Id.Vehicle.WeaponExtension.ROT_02.122mm": "Havoc B-13 rockets",
  "Id.Vehicle.WeaponExtension.ROT_03.MountedMachineGun": "AH-6M miniguns",
  "Id.Vehicle.WeaponExtension.ROT_03.RocketPods": "AH-6R rockets",
  "Id.Vehicle.WeaponExtension.ROT_04.MountedMachineGun": "Z20 Lakota miniguns",
  "Id.Vehicle.WeaponExtension.TNK_01.Artillery": "SPH-2 artillery",
  "Id.Vehicle.WeaponExtension.TNK_01.Heavy": "L2A6 cannon",
  "Id.Vehicle.WeaponExtension.TNK_01.MachineGun": "L2A6 machine gun",
  "Id.Vehicle.WeaponExtension.TNK_01.MountedMachineGun": "L2A6 mounted MG",
  "Id.Vehicle.WeaponExtension.WHL_02.SUV.RingTurret": "Kodiak M249",
  "Id.Vehicle.WeaponExtension.WHL_05.RingTurret": "Humvee M249",
  "Id.Vehicle.WeaponExtension.WHL_05.RingMinigun": "Humvee minigun",
  "Id.Vehicle.WeaponExtension.WHL_07.MachineGun": "Ural Defender M249",
  "Id.Vehicle.WeaponExtension.STN_01.MistralAA": "Talon 9K-SAM",
  "Id.Vehicle.WeaponExtension.STN_02.MainCannon": "STN 02 main cannon",
  "Id.Vehicle.WeaponExtension.STN_03.MainBarrel": "STN 03 main gun",
  "Id.Vehicle.WeaponExtension.STN_05.MainBarrel": "STN 05 main gun",
};

export function weaponName(cause: string | null): string | null {
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
