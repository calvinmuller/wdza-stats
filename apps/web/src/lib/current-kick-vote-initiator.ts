import { getCurrentVerifiedPlayerSteamId } from "./current-verified-player";
import { db } from "./db";
import { getCurrentStaff, hasRole } from "./require-staff";
import { getOwnSteamId } from "./staff-steam-link";

// Who may start a KickVote in this request - see docs/adr/0008. A signed-in
// Staff Member (moderator or admin) with a linked steamId comes first, as
// that steamId, which is proven theirs by the same Steam sign-in
// (docs/adr/0007); failing that, a signed-in Verified Player. startKickVote
// applies every initiator rule to the steamId, except that a Staff Member
// needn't be online.

export interface KickVoteInitiator {
  steamId: string;
  isStaff: boolean;
}

/** Who starts a KickVote for this request, or null if nobody may. */
export async function getCurrentKickVoteInitiator(): Promise<KickVoteInitiator | null> {
  const staff = await getCurrentStaffInitiator();
  const staffSteamId = staff ? await getOwnSteamId(db, staff.id) : null;
  if (staffSteamId) return { steamId: staffSteamId, isStaff: true };

  const playerSteamId = await getCurrentVerifiedPlayerSteamId();
  return playerSteamId ? { steamId: playerSteamId, isStaff: false } : null;
}

/** Whether this request is a signed-in Staff Member, who could start a KickVote once they link a steamId. */
export async function isCurrentStaffInitiator(): Promise<boolean> {
  return (await getCurrentStaffInitiator()) !== null;
}

async function getCurrentStaffInitiator() {
  const staff = await getCurrentStaff();
  return hasRole(staff, "moderator") && !staff.mustChangePassword ? staff : null;
}
