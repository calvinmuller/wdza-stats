import { hashPassword } from "better-auth/crypto";
import type { StaffRole } from "@wdza-stats/db";
import { auth } from "./auth";

// Better Auth's sign-up is disabled for anonymous callers (see auth.ts), so
// this is the only way a Staff Member comes into existence. Callers (the
// bootstrap page, the staff management screen) must check who is allowed to
// call it before they do.
export async function createStaffMember(input: {
  email: string;
  name: string;
  password: string;
  role: StaffRole;
}) {
  const ctx = await auth.$context;
  const email = input.email.trim().toLowerCase();
  const user = await ctx.internalAdapter.createUser(
    { email, name: input.name, role: input.role, emailVerified: false },
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
