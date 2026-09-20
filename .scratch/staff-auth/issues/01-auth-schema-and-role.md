# 01: Better Auth tables and Role column

**What to build:** Add the database tables Better Auth needs for email-and-password sign-in (user, session, account, and verification if the library requires it), plus a Role column (`admin` | `moderator`) on the Staff Member row, in `packages/db` with a Drizzle migration. Make sure the test-DB migration path (`db:migrate:test`) picks it up.

**Blocked by:** none

**Status:** closed

- [x] Migration creates the Better Auth tables and a non-null Role column constrained to `admin` and `moderator`
- [x] Email is unique per Staff Member
- [x] Schema is exported from `packages/db` and used by tests via the existing test-DB setup
- [x] Tests cover: the migration applies cleanly, and an invalid Role value is rejected
- [x] Terminology follows `CONTEXT.md` (Staff Member, Role); no "Account" or "User" in our own names beyond what Better Auth requires internally

## Comments

Closed: migration `0023_staff_auth.sql`. Better Auth's four core tables under our own names: `staff_members` (Better Auth "user", with a non-null `role` and a CHECK limiting it to `moderator`/`admin`, unique `email`), `staff_sessions`, `staff_credentials` (Better Auth "account"; the scrypt hash lives on `password`), and `staff_verifications` (unused, since no email is sent, but the library expects it). Sessions and credentials cascade-delete with their Staff Member. `STAFF_ROLES`/`StaffRole` live in `packages/db/src/staff.ts`. Ticket 02 will need to map Better Auth's model and field names onto these (`user`→`staff_members`, `session`→`staff_sessions`, `account`→`staff_credentials`, `verification`→`staff_verifications`, `userId`→`staffMemberId`) and declare `role` as an additional field. Tests in `staff.test.ts`.
