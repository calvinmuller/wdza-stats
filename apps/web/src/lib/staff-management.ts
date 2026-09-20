import { hashPassword } from "better-auth/crypto";
import { asc, eq } from "drizzle-orm";
import { staffMembers, staffSessions, STAFF_ROLES, type Database, type StaffRole } from "@wdza-stats/db";
import { auth } from "./auth";
import { createStaffMember, passwordProblem } from "./staff";

export type StaffResult = { ok: true } | { ok: false; error: string };

export interface StaffListing {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  mustChangePassword: boolean;
  createdAt: Date;
}

const LAST_ADMIN = "That is the last admin. Make someone else an admin first.";

export async function listStaffMembers(db: Database): Promise<StaffListing[]> {
  return db
    .select({
      id: staffMembers.id,
      email: staffMembers.email,
      name: staffMembers.name,
      role: staffMembers.role,
      mustChangePassword: staffMembers.mustChangePassword,
      createdAt: staffMembers.createdAt,
    })
    .from(staffMembers)
    .orderBy(asc(staffMembers.createdAt), asc(staffMembers.email));
}

/**
 * Adds a Staff Member with a password the admin chose. It is temporary: the new
 * Staff Member must replace it at first sign-in. Callers must already have
 * checked the actor is an admin.
 */
export async function addStaffMember(
  db: Database,
  input: { email: string; name: string; role: StaffRole; temporaryPassword: string },
): Promise<StaffResult> {
  const email = input.email.trim();
  const name = input.name.trim();
  if (!email.includes("@")) return { ok: false, error: "Enter a valid email address." };
  if (!name) return { ok: false, error: "Enter a name." };
  if (!STAFF_ROLES.includes(input.role)) return { ok: false, error: "Choose a Role." };
  const problem = passwordProblem(input.temporaryPassword);
  if (problem) return { ok: false, error: problem };

  const taken = await db
    .select({ id: staffMembers.id })
    .from(staffMembers)
    .where(eq(staffMembers.email, email.toLowerCase()))
    .limit(1);
  if (taken.length > 0) return { ok: false, error: "That email already belongs to a Staff Member." };

  await createStaffMember({ email, name, role: input.role, password: input.temporaryPassword, mustChangePassword: true });
  return { ok: true };
}

/**
 * Runs `change` on the target only if that wouldn't leave the site without an
 * admin. The admin rows are locked for the duration, so two concurrent demotions
 * can't each see "someone else is still an admin".
 */
async function guardingLastAdmin(
  db: Database,
  targetId: string,
  change: (tx: Parameters<Parameters<Database["transaction"]>[0]>[0]) => Promise<void>,
): Promise<StaffResult> {
  return db.transaction(async (tx) => {
    const admins = await tx
      .select({ id: staffMembers.id })
      .from(staffMembers)
      .where(eq(staffMembers.role, "admin"))
      .for("update");
    const [target] = await tx
      .select({ id: staffMembers.id, role: staffMembers.role })
      .from(staffMembers)
      .where(eq(staffMembers.id, targetId));
    if (!target) return { ok: false, error: "That Staff Member no longer exists." } as const;
    if (target.role === "admin" && admins.length <= 1) return { ok: false, error: LAST_ADMIN } as const;
    await change(tx);
    return { ok: true } as const;
  });
}

export async function changeStaffRole(db: Database, targetId: string, role: StaffRole): Promise<StaffResult> {
  if (!STAFF_ROLES.includes(role)) return { ok: false, error: "Choose a Role." };
  const [target] = await db.select({ role: staffMembers.role }).from(staffMembers).where(eq(staffMembers.id, targetId));
  if (!target) return { ok: false, error: "That Staff Member no longer exists." };
  if (target.role === role) return { ok: true };
  // Only leaving the admin role can strand the site; promoting needs no guard.
  if (role === "admin") {
    await db.update(staffMembers).set({ role, updatedAt: new Date() }).where(eq(staffMembers.id, targetId));
    return { ok: true };
  }
  return guardingLastAdmin(db, targetId, async (tx) => {
    await tx.update(staffMembers).set({ role, updatedAt: new Date() }).where(eq(staffMembers.id, targetId));
  });
}

export async function removeStaffMember(db: Database, targetId: string): Promise<StaffResult> {
  // Sessions and credentials go with the Staff Member (ON DELETE CASCADE).
  return guardingLastAdmin(db, targetId, async (tx) => {
    await tx.delete(staffMembers).where(eq(staffMembers.id, targetId));
  });
}

/**
 * Sets a password the admin chose, signs the Staff Member out everywhere, and
 * forces them to replace it at next sign-in. Works on any Staff Member,
 * including the acting admin.
 */
export async function setTemporaryPassword(
  db: Database,
  targetId: string,
  temporaryPassword: string,
): Promise<StaffResult> {
  const problem = passwordProblem(temporaryPassword);
  if (problem) return { ok: false, error: problem };
  const [target] = await db.select({ id: staffMembers.id }).from(staffMembers).where(eq(staffMembers.id, targetId));
  if (!target) return { ok: false, error: "That Staff Member no longer exists." };

  const ctx = await auth.$context;
  await ctx.internalAdapter.updatePassword(targetId, await hashPassword(temporaryPassword));
  await db.update(staffMembers).set({ mustChangePassword: true, updatedAt: new Date() }).where(eq(staffMembers.id, targetId));
  await db.delete(staffSessions).where(eq(staffSessions.staffMemberId, targetId));
  return { ok: true };
}

/**
 * A signed-in Staff Member replacing their own password, which also clears the
 * "must change" flag an admin's reset set. Their other sessions are signed out;
 * this one stays. `headers` are the request's, so Better Auth can tell whose
 * password it is.
 */
export async function changeOwnPassword(
  db: Database,
  input: { headers: Headers; staffMemberId: string; currentPassword: string; newPassword: string },
): Promise<StaffResult> {
  const problem = passwordProblem(input.newPassword);
  if (problem) return { ok: false, error: problem };
  if (input.newPassword === input.currentPassword) {
    return { ok: false, error: "Choose a password different from the current one." };
  }
  try {
    await auth.api.changePassword({
      body: {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
        revokeOtherSessions: true,
      },
      headers: input.headers,
    });
  } catch {
    return { ok: false, error: "The current password is wrong." };
  }
  await db
    .update(staffMembers)
    .set({ mustChangePassword: false, updatedAt: new Date() })
    .where(eq(staffMembers.id, input.staffMemberId));
  return { ok: true };
}
