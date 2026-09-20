# 05: Move the admin area to `/admin`

**What to build:** Move the existing admin screens from `apps/web/src/app/[adminSecret]/` to `/admin`, gated by session and Role instead of the secret. Nothing about what the screens edit changes: XP rewards, level curve, challenge and achievement definitions, notification rules and settings, player bans, and feed tokens.

**Blocked by:** 02, 04

**Status:** ready-for-agent

- [ ] All existing admin screens render at `/admin` for a signed-in admin
- [ ] An anonymous request gets `notFound()` (aside from the sign-in form, ticket 04)
- [ ] The old `/[adminSecret]` path no longer serves admin screens; it serves only the bootstrap page from ticket 03
- [ ] `page.test.ts` is updated for the new gate and still covers each config category
- [ ] `admin-config.ts` and the worker integration tests are unaffected
