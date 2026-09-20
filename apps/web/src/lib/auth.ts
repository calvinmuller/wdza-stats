import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  requireEnv,
  STAFF_ROLES,
  staffCredentials,
  staffMembers,
  staffSessions,
  staffVerifications,
} from "@wdza-stats/db";
import { db } from "./db";

// Staff sign-in (see CONTEXT.md: Staff Member, Role, and ADR 0005). Better
// Auth's "user" is our staffMembers, "account" is staffCredentials, and its
// userId columns are our staffMemberId.
//
// Email and password only, and no email is ever sent: there is no
// verification, reset or magic link. Sign-up is disabled, so the public
// /sign-up/email endpoint always refuses; Staff Members are created through
// createStaffMember (lib/staff.ts), never by anonymous callers.
export const auth = betterAuth({
  secret: requireEnv("BETTER_AUTH_SECRET"),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: staffMembers,
      session: staffSessions,
      account: staffCredentials,
      verification: staffVerifications,
    },
  }),
  user: {
    additionalFields: {
      // Server-owned: a client can never choose its own Role.
      role: { type: [...STAFF_ROLES], required: true, input: false },
    },
  },
  session: { fields: { userId: "staffMemberId" } },
  account: { fields: { userId: "staffMemberId" } },
  emailAndPassword: { enabled: true, disableSignUp: true },
  // Brute-force protection on the one credential endpoint. Applies to HTTP
  // requests only (Better Auth exempts server-side auth.api calls), so the
  // sign-in form must go through the client, not a server action. In-memory
  // counters: per web instance, reset on restart, which is fine at this scale.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: { "/sign-in/email": { window: 60, max: 5 } },
  },
  advanced: {
    // Session cookies are httpOnly always; Secure whenever we're in production.
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  // Must stay last.
  plugins: [nextCookies()],
});
