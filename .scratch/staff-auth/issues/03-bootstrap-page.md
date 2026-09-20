# 03: Bootstrap page at the secret path

**What to build:** Keep `ADMIN_PATH_SECRET`, but only to gate a bootstrap page at the path segment equal to the secret. When no admin exists it lets you create the first admin (email and password). At any time it can reset an existing admin's password, which is the recovery path when no admin can sign in. Any other path segment still 404s.

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] With no admin in the database, the bootstrap page creates the first admin
- [ ] Once an admin exists, the create-first-admin form is refused (server-side, not just hidden)
- [ ] The page can set a new password for an existing admin
- [ ] A wrong secret 404s, and the bootstrap server actions re-check the secret themselves
- [ ] Tests cover: first-admin creation, refusal when an admin exists, password reset, and the wrong-secret 404
