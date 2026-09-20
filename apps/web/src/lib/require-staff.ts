import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { StaffRole } from "@wdza-stats/db";
import { auth } from "./auth";

export interface CurrentStaff {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
}

// admin outranks moderator: every admin can do what a moderator can.
const RANK: Record<StaffRole, number> = { moderator: 1, admin: 2 };

export function hasRole(staff: CurrentStaff | null, required: StaffRole): staff is CurrentStaff {
  return staff !== null && RANK[staff.role] >= RANK[required];
}

/** The signed-in Staff Member for this request, or null. */
export async function getCurrentStaff(): Promise<CurrentStaff | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, email, name, role } = session.user as typeof session.user & { role: StaffRole };
  return { id, email, name, role };
}

/**
 * For pages and route segments: an anonymous or under-privileged request gets
 * the same 404 as any unknown URL, so the admin area is never advertised.
 */
export async function requireStaffPage(required: StaffRole): Promise<CurrentStaff> {
  const staff = await getCurrentStaff();
  if (!hasRole(staff, required)) notFound();
  return staff;
}

/**
 * For server actions, which are their own POST endpoints and must re-check
 * regardless of whether their page rendered.
 */
export async function requireStaffAction(required: StaffRole): Promise<CurrentStaff> {
  const staff = await getCurrentStaff();
  if (!hasRole(staff, required)) throw new Error("Forbidden");
  return staff;
}
