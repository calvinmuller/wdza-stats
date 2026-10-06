// Thumbnails for the Top weapons panel, keyed by the Kill's raw `cause` tag
// (e.g. Id.Item.AK74M), as paths under apps/web/public. Drop the file into
// public/weapons or public/vehicles and add its entry here; a weapon with no
// entry shows a placeholder. A vehicle's own guns share the vehicle's art.
export const WEAPON_IMAGES: Record<string, string> = {
  // Firearms and launchers
  "Id.Item.A91": "weapons/a91.webp",
  "Id.Item.KH2002": "weapons/kh2002.webp",
  "Id.Item.TAR21": "weapons/t21.webp",
  "Id.Item.AK74M": "weapons/ak47.webp",
  "Id.Item.WEPN_029": "weapons/galil.webp",
  "Id.Item.M4": "weapons/m4.webp",
  "Id.Item.MP9": "weapons/amp9.webp",
  "Id.Item.Vector": "weapons/super45.webp",
  "Id.Item.MP43": "weapons/mp43.webp",
  "Id.Item.M500": "weapons/m500.webp",
  "Id.Item.M249": "weapons/m249.webp",
  "Id.Item.LMG_02": "weapons/pkm.webp",
  "Id.Item.SKS": "weapons/sks.webp",
  "Id.Item.SVDM": "weapons/svd.webp",
  "Id.Item.RFB": "weapons/bmr308.webp",
  "Id.Item.Mosin": "weapons/mosin.webp",
  "Id.Item.SV98": "weapons/sv98.webp",
  "Id.Item.MK22": "weapons/mk22.webp",
  "Id.Item.CombatBow": "weapons/bow.webp",
  "Id.Item.Glock17": "weapons/ggx17.webp",
  "Id.Item.Judge": "weapons/judge.webp",
  "Id.Item.RPG7": "weapons/rpg7.webp",
  "Id.Item.CGM4": "weapons/maaws.webp",
  "Id.Item.MMGL": "weapons/mgl40.webp",
  // Vehicles: a roadkill or the crew's guns
  "Vehicle.Variant.Air.Rotary.Littlebird.Default": "vehicles/mh5.webp",
  "Vehicle.Variant.Air.Rotary.Littlebird.MountedMachineGuns": "vehicles/ah6mminiguns.webp",
  "Vehicle.Variant.Air.Rotary.Littlebird.RocketPods": "vehicles/ah6mrockets.webp",
  "Vehicle.Variant.Air.Rotary.Havoc.Default": "vehicles/havoc.webp",
  "Vehicle.Variant.Air.Rotary.ROT_04.Default": "vehicles/z20lakota.webp",
  "Vehicle.Variant.Air.Rotary.ROT_04.MountedMachineGuns": "vehicles/z20lakotaminiguns.webp",
  "Vehicle.Variant.Land.Tracked.TNK_01.Heavy": "vehicles/l2a6.webp",
  "Vehicle.Variant.Land.Tracked.TNK_01.Artillery": "vehicles/sph2.webp",
  "Vehicle.Variant.Land.Wheeled.Humvee.Default": "vehicles/humvee.webp",
  "Vehicle.Variant.Land.Wheeled.Humvee.MachineGun": "vehicles/humveem249.webp",
  "Vehicle.Variant.Land.Wheeled.Humvee.Minigun": "vehicles/humveeminigun.webp",
  "Vehicle.Variant.Land.Wheeled.Kodiak.Default": "vehicles/kodiak.webp",
  "Vehicle.Variant.Land.Wheeled.Kodiak.MachineGun": "vehicles/kodiakm249.webp",
  "Vehicle.Variant.Land.Wheeled.Kodiak.Pickup": "vehicles/kodiakpickup.webp",
  "Vehicle.Variant.Land.Wheeled.Ural.Default": "vehicles/ural.webp",
  "Vehicle.Variant.Land.Wheeled.Ural.Battle": "vehicles/uraldefender.webp",
  "Vehicle.Variant.Land.Wheeled.Ural.Attack": "vehicles/uraldefenderm249.webp",
  "Vehicle.Variant.Land.Wheeled.Bobcat.Default": "vehicles/bobcat.webp",
  "Vehicle.Variant.Land.Wheeled.DuneBuggy.Default": "vehicles/dunebuggy.webp",
  // Vehicle weapons
  "Id.Vehicle.WeaponExtension.ROT_02.30mmCannon": "vehicles/havoc.webp",
  "Id.Vehicle.WeaponExtension.ROT_02.122mm": "vehicles/havoc.webp",
  "Id.Vehicle.WeaponExtension.ROT_03.MountedMachineGun": "vehicles/ah6mminiguns.webp",
  "Id.Vehicle.WeaponExtension.ROT_03.RocketPods": "vehicles/ah6mrockets.webp",
  "Id.Vehicle.WeaponExtension.ROT_04.MountedMachineGun": "vehicles/z20lakotaminiguns.webp",
  "Id.Vehicle.WeaponExtension.TNK_01.Artillery": "vehicles/sph2.webp",
  "Id.Vehicle.WeaponExtension.TNK_01.Heavy": "vehicles/l2a6.webp",
  "Id.Vehicle.WeaponExtension.TNK_01.MachineGun": "vehicles/l2a6.webp",
  "Id.Vehicle.WeaponExtension.TNK_01.MountedMachineGun": "vehicles/l2a6.webp",
  "Id.Vehicle.WeaponExtension.WHL_02.SUV.RingTurret": "vehicles/kodiakm249.webp",
  "Id.Vehicle.WeaponExtension.WHL_05.RingTurret": "vehicles/humveem249.webp",
  "Id.Vehicle.WeaponExtension.WHL_05.RingMinigun": "vehicles/humveeminigun.webp",
  "Id.Vehicle.WeaponExtension.WHL_07.MachineGun": "vehicles/uraldefenderm249.webp",
};

/** The public URL of a weapon's thumbnail, or null when we have none. */
export function getWeaponImageUrl(cause: string): string | null {
  const file = WEAPON_IMAGES[cause];
  return file ? `/${file}` : null;
}
