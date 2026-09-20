import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { staffMembers, staffSessions, type Database } from "@wdza-stats/db";
import { auth } from "./auth";
import { createStaffMember, passwordProblem } from "./staff";

export type BootstrapResult = { ok: true } | { ok: false; error: string };

export async function adminExists(db: Database): Promise<boolean> {
  const rows = await db
    .select({ id: staffMembers.id })
    .from(staffMembers)
    .where(eq(staffMembers.role, "admin"))
    .limit(1);
  return rows.length > 0;
}

/**
 * Creates the first admin, and only while no admin exists. The check is here,
 * server-side, not just in the form: the action is its own POST endpoint.
 */
export async function createFirstAdmin(
  db: Database,
  input: { email: string; name: string; password: string },
): Promise<BootstrapResult> {
  if (await adminExists(db)) {
    return { ok: false, error: "An admin already exists. Use the password reset instead." };
  }
  const email = input.email.trim();
  const name = input.name.trim();
  if (!email.includes("@")) return { ok: false, error: "Enter a valid email address." };
  if (!name) return { ok: false, error: "Enter a name." };
  const passwordError = passwordProblem(input.password);
  if (passwordError) return { ok: false, error: passwordError };

  const taken = await db
    .select({ id: staffMembers.id })
    .from(staffMembers)
    .where(eq(staffMembers.email, email.toLowerCase()))
    .limit(1);
  if (taken.length > 0) return { ok: false, error: "That email already belongs to a Staff Member." };

  await createStaffMember({ email, name, password: input.password, role: "admin" });
  return { ok: true };
}

/**
 * Sets a new password for an existing admin and signs them out everywhere.
 * This is the recovery path when no admin can sign in (ADR 0005); moderators
 * are deliberately not reachable from here.
 */
export async function resetAdminPassword(
  db: Database,
  input: { email: string; password: string },
): Promise<BootstrapResult> {
  const passwordError = passwordProblem(input.password);
  if (passwordError) return { ok: false, error: passwordError };

  const [admin] = await db
    .select({ id: staffMembers.id })
    .from(staffMembers)
    .where(and(eq(staffMembers.email, input.email.trim().toLowerCase()), eq(staffMembers.role, "admin")))
    .limit(1);
  if (!admin) return { ok: false, error: "No admin has that email." };

  const ctx = await auth.$context;
  await ctx.internalAdapter.updatePassword(admin.id, await hashPassword(input.password));
  await db.delete(staffSessions).where(eq(staffSessions.staffMemberId, admin.id));
  return { ok: true };
}
