# 07: Staff Member management (admin only)

**What to build:** An admin-only screen to manage Staff Members: create one (email plus a temporary password), change a Role, reset a password (temporary, forced change at next sign-in), and remove one. The last admin can never be removed or demoted. A Role is only ever granted to an existing Staff Member, never pre-granted to an unregistered email.

**Blocked by:** 06

**Status:** closed

- [x] An admin can create a Staff Member with a Role and a temporary password
- [x] A Staff Member with a temporary password is forced through a change-password screen before they can do anything else
- [x] An admin can change another Staff Member's Role, reset their password, and remove them
- [x] Demoting or removing the last admin is rejected server-side
- [x] Moderators and anonymous callers cannot reach any of this, including by calling the actions directly
- [x] Tests cover each operation, the last-admin protection, and the forced password change

## Comments

Closed. New: `/admin/staff` (admin only; linked from the admin header) to add a Staff Member (name, email, Role, temporary password), change a Role, reset a password, and remove; `/admin/change-password` (any signed-in Staff Member).

Forced password change: new column `staff_members.must_change_password` (migration `0024`), exposed to Better Auth as an additional field. It is set when an admin creates a Staff Member or resets their password, and cleared by `changeOwnPassword`. While it is set, `requireStaffPage` redirects to `/admin/change-password` and `requireStaffAction` throws "Password change required", so every admin page and action is blocked until they choose their own. The change-password action deliberately uses `getCurrentStaff` instead, since it is the way out. Changing a password signs out the person's other sessions.

Last-admin protection is server-side in `lib/staff-management.ts`: demoting or removing an admin locks the admin rows (`FOR UPDATE`) inside a transaction and refuses if that admin is the only one. This is a real race: with the lock removed, two concurrent demotions left zero admins in 39 of 40 runs, so the test repeats the race 15 times and was checked to fail without the lock. A Staff Member may be removed or demoted by themselves as long as another admin remains. Removal cascades to their sessions and credentials, so they are signed out at once. Password resets and removals sign the person out everywhere.

An admin cannot see or set anyone's permanent password: the password an admin types is only ever temporary. Ticket 08 (attribution) is next for these actions; the new staff actions are good candidates to record who acted.

The bootstrap page's admin password reset (ticket 03) does not set the must-change flag: the person doing it already holds the secret and chooses the password they will use.
