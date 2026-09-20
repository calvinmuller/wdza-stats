# 07: Staff Member management (admin only)

**What to build:** An admin-only screen to manage Staff Members: create one (email plus a temporary password), change a Role, reset a password (temporary, forced change at next sign-in), and remove one. The last admin can never be removed or demoted. A Role is only ever granted to an existing Staff Member, never pre-granted to an unregistered email.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] An admin can create a Staff Member with a Role and a temporary password
- [ ] A Staff Member with a temporary password is forced through a change-password screen before they can do anything else
- [ ] An admin can change another Staff Member's Role, reset their password, and remove them
- [ ] Demoting or removing the last admin is rejected server-side
- [ ] Moderators and anonymous callers cannot reach any of this, including by calling the actions directly
- [ ] Tests cover each operation, the last-admin protection, and the forced password change
