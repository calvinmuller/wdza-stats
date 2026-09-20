import type { Database, StaffAction } from "@wdza-stats/db";
import { staffAuditLog } from "@wdza-stats/db";

/** The signed-in Staff Member behind an action, or null for the bootstrap page. */
export type Actor = { id: string; email: string } | null;

/** Text fields of a submitted form, for recording what an edit set. */
export function formFields(formData: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") fields[key] = value;
  }
  return fields;
}

/**
 * Records one successful action. Call it only after the action worked, and never
 * put a password or token in `detail`.
 */
export async function recordStaffAction(
  db: Database,
  actor: Actor,
  action: StaffAction,
  entry: { target?: string; detail?: Record<string, unknown> } = {},
): Promise<void> {
  await db.insert(staffAuditLog).values({
    staffMemberId: actor?.id ?? null,
    actorEmail: actor?.email ?? "(bootstrap page)",
    action,
    target: entry.target ?? null,
    detail: entry.detail ?? null,
  });
}
