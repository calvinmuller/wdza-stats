import { getCurrentVerifiedPlayerSteamId } from "./current-verified-player";
import { db } from "./db";
import { getCurrentStaff, hasRole } from "./require-staff";
import { getOwnSteamId } from "./staff-steam-link";

// Who may start a KickVote in this request, as a steamId - see docs/adr/0008.
// A signed-in Verified Player comes first; failing that, a signed-in admin
// stands in as their linked steamId, which is proven theirs by the same Steam
// sign-in (docs/adr/0007). Either way startKickVote still applies every
// initiator rule to that steamId.

/** The steamId that starts a KickVote for this request, or null if nobody may. */
export async function getCurrentKickVoteInitiatorSteamId(): Promise<string | null> {
  const playerSteamId = await getCurrentVerifiedPlayerSteamId();
  if (playerSteamId) return playerSteamId;

  const staff = await getCurrentAdmin();
  return staff ? getOwnSteamId(db, staff.id) : null;
}

/** Whether this request is a signed-in admin, who could start a KickVote once they link a steamId. */
export async function isCurrentAdmin(): Promise<boolean> {
  return (await getCurrentAdmin()) !== null;
}

async function getCurrentAdmin() {
  const staff = await getCurrentStaff();
  return hasRole(staff, "admin") && !staff.mustChangePassword ? staff : null;
}
