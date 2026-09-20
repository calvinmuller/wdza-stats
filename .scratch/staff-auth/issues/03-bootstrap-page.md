# 03: Bootstrap page at the secret path

**What to build:** Keep `ADMIN_PATH_SECRET`, but only to gate a bootstrap page at the path segment equal to the secret. When no admin exists it lets you create the first admin (email and password). At any time it can reset an existing admin's password, which is the recovery path when no admin can sign in. Any other path segment still 404s.

**Blocked by:** 01, 02

**Status:** closed

- [x] With no admin in the database, the bootstrap page creates the first admin
- [x] Once an admin exists, the create-first-admin form is refused (server-side, not just hidden)
- [x] The page can set a new password for an existing admin
- [x] A wrong secret 404s, and the bootstrap server actions re-check the secret themselves
- [x] Tests cover: first-admin creation, refusal when an admin exists, password reset, and the wrong-secret 404

## Comments

Closed. The bootstrap page is at `/<ADMIN_PATH_SECRET>/bootstrap` (`apps/web/src/app/[adminSecret]/bootstrap/`), not at the bare secret path: until ticket 05 the bare path still serves the admin config area, and the two can't share it. Ticket 05 should leave this `bootstrap` sub-route in place when it removes the admin screens from `[adminSecret]/page.tsx`. It is still gated by the secret, as the spec wants.

The page shows "Create the first admin" while no admin exists, and "Reset an admin's password" once one does. The logic is in `lib/staff-bootstrap.ts` (`adminExists`, `createFirstAdmin`, `resetAdminPassword`) and the server actions in `bootstrap/actions.ts` each re-check the secret. Refusing a second first-admin happens in the library function, not just the form. Reset only reaches admins (a moderator's email is refused), replaces the password, and deletes that admin's sessions. Passwords are 8 to 128 characters, Better Auth's defaults.

Known gap: the "no admin exists" check and the insert aren't atomic, so two simultaneous first-admin submissions could both succeed. Acceptable for a page only the site owner can reach; a partial unique index would close it if wanted.

The forced-password-change flow after a reset belongs to ticket 07 (admin-set temporary passwords); this reset does not force a change.
