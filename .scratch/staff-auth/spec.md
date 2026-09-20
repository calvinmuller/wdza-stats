Status: ready-for-agent

# Staff Auth: sign-in for Staff Members, replacing the secret admin URL

## Problem Statement

The admin area at `apps/web/src/app/[adminSecret]/` is gated only by an unguessable path segment (`ADMIN_PATH_SECRET`, see `apps/web/src/lib/admin-secret.ts`). It identifies no one: anyone who learns the URL is an admin, the secret can leak through logs and browser history, and no action can be attributed to a person. Every server action in `actions.ts` re-checks the same shared secret. There is also no way to give someone narrower rights, such as banning players without being able to retune XP rewards.

## Solution

Add real sign-in for **Staff Members** (see `CONTEXT.md`) using Better Auth with email and password. The admin area moves to `/admin`, requires a session and a **Role** check, and 404s otherwise. `ADMIN_PATH_SECRET` survives only to gate a bootstrap page that creates the first admin and resets an admin's password when no admin can sign in. The decision and rejected alternatives are in `docs/adr/0005-staff-login-replaces-the-secret-admin-url.md`.

## Domain Decisions (from grilling session)

- **Staff only.** Players never sign in and there is no Account or User concept. Every public page and API stays public; login is additive. Steam login is deferred (custom Better Auth plugin needed, since Steam uses OpenID 2.0; nothing for it to do without player-facing features).
- **New terms `Staff Member` and `Role`.** Glossary updated. Avoid "User", "Account", and "Admin" as a kind of person.
- **Better Auth, email and password only.** No email is ever sent: no verification, no magic link or OTP, no self-service password reset. Email addresses are therefore unverified strings used as the login name.
- **No public sign-up.** Staff Members are created by the bootstrap page or by an admin. The sign-up endpoint must be disabled or unreachable for anonymous callers.
- **Roles**: `moderator` and `admin`, exactly one per Staff Member.
  - `moderator`: ban and unban players.
  - `admin`: everything a moderator can, plus edit game configuration (XP rewards, level curve, challenge and achievement definitions, notification rules and settings), generate feed tokens, and manage Staff Members and their Roles.
  - The last remaining admin can never be removed or demoted.
- **Granting a Role only to an existing Staff Member.** The role UI lists existing Staff Members; it never pre-grants to an unregistered email, because anyone could claim that email by registering first. To add someone new, an admin creates the Staff Member directly and hands over a temporary password.
- **Password recovery**: an admin sets a temporary password for another Staff Member, and the Staff Member must change it at next sign-in. If no admin can sign in, the bootstrap page resets an admin's password.
- **Admin location**: `/admin`, behind session and Role checks. An unauthenticated or under-privileged request gets `notFound()` (same as today's non-matching path), so the area stays undiscoverable. Every server action re-checks session and Role itself, since a server action is its own POST endpoint.
- **`ADMIN_PATH_SECRET` becomes bootstrap-only.** The bootstrap page (still at a path segment equal to the secret) does two things: when no admin exists, it creates the first admin (email and password); at any time it can reset an existing admin's password. Everything else at the old `/[adminSecret]` path is removed. Retiring the secret entirely is a later step, once the recovery path is no longer needed.
- **Attribution.** Staff actions (ban, unban, config edits, feed token generation, Staff Member changes) should be attributable to the acting Staff Member. Exact audit-log shape is left to implementation; at minimum, record who banned or unbanned a player if the ban record has room for it.
- **Schema lives in `packages/db`** alongside the other tables, with a Drizzle migration. Better Auth's own tables (user, session, account, verification as required by the library) plus a Role column.
- **RCON stays read-only** (ADR 0003): nothing here writes to the game server.

## Tickets (build order, see `issues/`)

1. Better Auth tables and Role column in `packages/db`, with migration and test-DB support.
2. Better Auth wiring in `apps/web`: auth route handler, session helper, `requireStaff(role)` helper. Sign-up disabled to anonymous callers.
3. Bootstrap page at the secret path: create first admin when none exists; reset an admin's password.
4. `/admin` sign-in page and sign-out.
5. Move the admin area from `/[adminSecret]` to `/admin`, gated by session and Role. Update `page.test.ts`.
6. Role checks on every server action: moderator gets ban and unban; everything else is admin-only.
7. Staff Member management UI (admin only): create, change Role, reset password, remove; last-admin protection.
8. Attribution of staff actions.
9. Cleanup: remove secret checks from `actions.ts`; update `.env.example`, README and `docs/agents` references.

## Testing Decisions

- Test observable behaviour through the same integration style as `admin-config.test.ts` and `page.test.ts`: an unauthenticated request 404s; a moderator can ban but not edit config; an admin can do both; the last admin cannot be demoted or removed; anonymous sign-up is rejected; the bootstrap page refuses to create a first admin once one exists but still resets a password.
- Server actions are tested directly as their own entry points, not only through the page.

## Out of Scope

- Player sign-in of any kind, including Steam and Discord, and claiming a stats page.
- Sending email: verification, magic links, OTP, password reset.
- Additional Roles beyond `moderator` and `admin`.
- Self-service password change beyond forced change after an admin reset (nice to have, not required).
- Two-factor authentication.
- A full audit log UI.
