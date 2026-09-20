# 05: Move the admin area to `/admin`

**What to build:** Move the existing admin screens from `apps/web/src/app/[adminSecret]/` to `/admin`, gated by session and Role instead of the secret. Nothing about what the screens edit changes: XP rewards, level curve, challenge and achievement definitions, notification rules and settings, player bans, and feed tokens.

**Blocked by:** 02, 04

**Status:** closed

- [x] All existing admin screens render at `/admin` for a signed-in admin
- [x] An anonymous request gets `notFound()` (aside from the sign-in form, ticket 04)
- [x] The old `/[adminSecret]` path no longer serves admin screens; it serves only the bootstrap page from ticket 03
- [x] `page.test.ts` is updated for the new gate and still covers each config category
- [x] `admin-config.ts` and the worker integration tests are unaffected

## Comments

Closed. `page.tsx`, `actions.ts`, `feed-token-form.tsx` and `page.test.ts` moved (`git mv`) from `app/[adminSecret]/` to `app/admin/`. `app/[adminSecret]/` now holds only `bootstrap/` (ticket 03); the bare secret path no longer matches any route. `next build` confirms the route table: `/admin`, `/admin/sign-in`, `/[adminSecret]/bootstrap`.

`AdminPage` calls `requireStaffPage("admin")`, so anonymous visitors and moderators get the ordinary 404. Every action drops its bound `secret` parameter and calls `requireStaffAction("admin")` first, then redirects to `/admin`. That already covers part of ticket 06 (the secret is gone from the actions), but everything, including ban and unban, is admin-only for now: ticket 06 still has to open ban and unban, and the ban screens, to moderators. The admin header shows who is signed in and a sign-out button.

New `actions.test.ts` calls every action directly as an anonymous caller, a moderator and an admin. `generateFeedTokenAction` is not run as an admin there (it would replace a real Server's token if one exists in the shared test DB); its refusals are covered. `page.test.ts` was rewritten for the new gate.

Also added `BETTER_AUTH_URL` (optional, in `.env.example`): `next build` warned that Better Auth's base URL was unset, in which case it trusts the origin each request claims. Set it to the public origin on Railway.
