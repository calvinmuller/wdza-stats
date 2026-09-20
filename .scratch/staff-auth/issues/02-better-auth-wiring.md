# 02: Better Auth wiring and `requireStaff` helper

**What to build:** Wire Better Auth into `apps/web` with email and password only: the auth route handler, a server-side session helper, and a `requireStaff(role)` helper that server components and server actions can call. No email sending is configured. Anonymous sign-up must be disabled or unreachable.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Email-and-password sign-in works against the tables from ticket 01; no verification or reset emails are ever sent
- [ ] An anonymous call to the sign-up endpoint is rejected
- [ ] `requireStaff("moderator")` accepts moderators and admins; `requireStaff("admin")` accepts admins only; anything else fails as `notFound()` for pages and as an error for server actions
- [ ] Session cookies are httpOnly and secure in production
- [ ] Tests cover: sign-in success and failure, sign-up rejected, and the role matrix for `requireStaff`
