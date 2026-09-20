# 02: Better Auth wiring and `requireStaff` helper

**What to build:** Wire Better Auth into `apps/web` with email and password only: the auth route handler, a server-side session helper, and a `requireStaff(role)` helper that server components and server actions can call. No email sending is configured. Anonymous sign-up must be disabled or unreachable.

**Blocked by:** 01

**Status:** closed

- [x] Email-and-password sign-in works against the tables from ticket 01; no verification or reset emails are ever sent
- [x] An anonymous call to the sign-up endpoint is rejected
- [x] `requireStaff("moderator")` accepts moderators and admins; `requireStaff("admin")` accepts admins only; anything else fails as `notFound()` for pages and as an error for server actions
- [x] Session cookies are httpOnly and secure in production
- [x] Tests cover: sign-in success and failure, sign-up rejected, and the role matrix for `requireStaff`

## Comments

Closed. Better Auth 1.7.5 is configured in `apps/web/src/lib/auth.ts` (Drizzle adapter over the `staff_*` tables, `role` as a server-owned additional field, `userId` mapped to `staffMemberId`, `emailAndPassword` with `disableSignUp: true`, `nextCookies()` last). The route handler is `app/api/auth/[...all]/route.ts`. `lib/require-staff.ts` has `getCurrentStaff`, `hasRole` (admin outranks moderator), `requireStaffPage` (404s, for pages) and `requireStaffAction` (throws "Forbidden", for server actions). `lib/staff.ts` has `createStaffMember`, the only way a Staff Member comes into existence, since sign-up is disabled; tickets 03 and 07 must call it, and callers must check who may.

Anonymous sign-up is refused with `EMAIL_PASSWORD_SIGN_UP_DISABLED` both over HTTP and through `auth.api`. New env var `BETTER_AUTH_SECRET` (in `.env.example`; `vitest.setup.ts` supplies a test value); production needs it set on the web service.

Not asserted by a test: the `Secure` flag on the session cookie in production. It is set by `advanced.useSecureCookies: NODE_ENV === "production"`; `HttpOnly` is asserted. No rate limiting configured yet, which is ticket 04's job.
