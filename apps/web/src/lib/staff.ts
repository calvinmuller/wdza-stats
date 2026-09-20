import { hashPassword } from "better-auth/crypto";
import type { StaffRole } from "@wdza-stats/db";
import { auth } from "./auth";

// Better Auth's own default bounds for email-and-password.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Why a password is unacceptable, or null if it's fine. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return null;
}

// Better Auth's sign-up is disabled for anonymous callers (see auth.ts), so
// this is the only way a Staff Member comes into existence. Callers (the
// bootstrap page, the staff management screen) must check who is allowed to
// call it before they do.
export async function createStaffMember(input: {
  email: string;
  name: string;
  password: string;
  role: StaffRole;
  // True when an admin chose the password: the Staff Member must replace it
  // before doing anything else.
  mustChangePassword?: boolean;
}) {
  const ctx = await auth.$context;
  const email = input.email.trim().toLowerCase();
  const user = await ctx.internalAdapter.createUser(
    {
      email,
      name: input.name,
      role: input.role,
      emailVerified: false,
      mustChangePassword: input.mustChangePassword ?? false,
    },
    { method: "email-password" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await hashPassword(input.password),
  });
  return user;
}
