# 01: Better Auth tables and Role column

**What to build:** Add the database tables Better Auth needs for email-and-password sign-in (user, session, account, and verification if the library requires it), plus a Role column (`admin` | `moderator`) on the Staff Member row, in `packages/db` with a Drizzle migration. Make sure the test-DB migration path (`db:migrate:test`) picks it up.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] Migration creates the Better Auth tables and a non-null Role column constrained to `admin` and `moderator`
- [ ] Email is unique per Staff Member
- [ ] Schema is exported from `packages/db` and used by tests via the existing test-DB setup
- [ ] Tests cover: the migration applies cleanly, and an invalid Role value is rejected
- [ ] Terminology follows `CONTEXT.md` (Staff Member, Role); no "Account" or "User" in our own names beyond what Better Auth requires internally
