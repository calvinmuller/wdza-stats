import { staffMembers, type Database } from "@wdza-stats/db";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { recordStaffAction, type Actor } from "./staff-audit";

// A Staff Member's own linked steamId - see CONTEXT.md's Staff Member entry
// and docs/adr/0007. Linking only ever happens at the end of a Steam sign-in
// the Staff Member completed themselves (app/api/steam/staff-link), so a
// linked steamId is proven theirs; that proof is what lets it shield the
// steamId from being a KickVote's target.

export type StaffSteamLinkResult = { ok: true } | { ok: false; error: string };

/** Links `steamId` (from verifySteamAssertion, never a form) to the acting Staff Member. */
export async function linkOwnSteamId(
  db: Database,
  actor: NonNullable<Actor>,
  steamId: string,
): Promise<StaffSteamLinkResult> {
  const [holder] = await db
    .select({ id: staffMembers.id })
    .from(staffMembers)
    .where(eq(staffMembers.steamId, steamId))
    .limit(1);
  if (holder && holder.id !== actor.id) {
    return { ok: false, error: "That Steam account is already linked to another Staff Member." };
  }
  if (holder) return { ok: true };

  try {
    await db.update(staffMembers).set({ steamId, updatedAt: new Date() }).where(eq(staffMembers.id, actor.id));
  } catch {
    // staff_members_steam_id_unique: another Staff Member linked it in between.
    return { ok: false, error: "That Steam account is already linked to another Staff Member." };
  }
  await recordStaffAction(db, actor, "link_own_steam_id", { target: steamId });
  return { ok: true };
}

/** Removes the acting Staff Member's linked steamId, if they have one. */
export async function unlinkOwnSteamId(db: Database, actor: NonNullable<Actor>): Promise<void> {
  const [row] = await db
    .update(staffMembers)
    .set({ steamId: null, updatedAt: new Date() })
    .where(and(eq(staffMembers.id, actor.id), isNotNull(staffMembers.steamId)))
    .returning({ id: staffMembers.id });
  if (row) await recordStaffAction(db, actor, "unlink_own_steam_id");
}

/** The acting Staff Member's linked steamId, or null. */
export async function getOwnSteamId(db: Database, staffMemberId: string): Promise<string | null> {
  const [row] = await db
    .select({ steamId: staffMembers.steamId })
    .from(staffMembers)
    .where(eq(staffMembers.id, staffMemberId))
    .limit(1);
  return row?.steamId ?? null;
}

/** Which of `steamIds` are linked to a Staff Member, and so can't be a KickVote's target. */
export async function getStaffSteamIds(db: Database, steamIds: string[]): Promise<Set<string>> {
  if (steamIds.length === 0) return new Set();
  const rows = await db
    .select({ steamId: staffMembers.steamId })
    .from(staffMembers)
    .where(inArray(staffMembers.steamId, Array.from(new Set(steamIds))));
  return new Set(rows.flatMap((row) => (row.steamId ? [row.steamId] : [])));
}
