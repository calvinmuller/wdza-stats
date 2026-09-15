# 15: Admin config area

**What to build:** A server/admin configuration area for editing XP rewards, the level curve, challenge definitions, achievement definitions, and notification settings (priority thresholds, per-minute cap) — all previously seeded as config rows in earlier tickets. No new authentication system: the admin screens sit behind an unguessable, env-configured secret URL path, consistent with the earlier decision not to build real auth for this pass.

**Blocked by:** 05: XP ledger + XP awards, 06: Levels + level-up events, 08: Achievement engine, 09: Daily challenges, 10: Notification recording + throttling

**Status:** closed

- [x] The admin area is reachable only via a secret URL path configured through an environment variable, not discoverable through normal site navigation
- [x] XP reward values, the level curve, challenge definitions, achievement definitions, and notification priority/cooldown settings can all be viewed and edited through this area
- [x] Editing a value takes effect for subsequent processing without requiring a redeploy
- [x] No RCON credentials, password, or Authorization header are ever exposed through this area or its network requests
- [x] Tests cover: editing at least one value in each config category and confirming it's picked up by the relevant engine afterward

## Comments

Closed: implemented on `master` (commit `484fe25`). The admin area lives at `apps/web/src/app/[adminSecret]/` - a dynamic route segment matched only when it equals `ADMIN_PATH_SECRET` (a new required env var, added to `.env.example`); any other single-segment path (the existing behavior for every unmatched URL) still 404s via `notFound()`, so the area is never linked from `NavLinks` or discoverable any other way.

All six config tables from earlier tickets (`xp_rewards`, `level_thresholds`, `challenge_definitions`, `achievement_definitions`, `notification_rules`, `notification_settings`) are listed and editable via `apps/web/src/lib/admin-config.ts` (the data-access layer, unit-tested directly in `admin-config.test.ts`) and `page.tsx`'s per-row forms. Structural columns that select *which* engine logic runs (challenge `type`/`scope`, achievement `trigger`) are shown read-only rather than editable, since editing those is a bigger design change than "retune a number" - only the tunable knobs (amounts, thresholds, targets, priorities, templates, the per-minute cap) are editable.

Mutations go through Next Server Actions (`actions.ts`), one per update. Since a Server Action is its own POST endpoint reachable independent of whether its page was ever rendered, each action re-checks the secret itself (not just `page.tsx`'s render-time gate) before touching the database.

No migration was needed - every config table already existed. "Takes effect without a redeploy" was already true structurally (every worker engine reads its config table fresh per poll, never caching it); this is proven rather than just asserted by six new integration tests appended to `apps/worker/src/match-tracker.test.ts`'s "Admin-configurable settings take effect without a redeploy (ticket 15 integration)" block - one per config category, each editing a row directly then running `pollAndPersistSnapshot` and asserting the new value was used (a lowered level threshold firing a level-up sooner, a lowered challenge target completing early with a new XP reward, a raised achievement threshold delaying an unlock, an edited notification template rendering, and a lowered per-minute cap dropping a notification that would otherwise have recorded).

Also fixed a pre-existing test-isolation bug, already flagged (but left unaddressed) in ticket 14's own closing comment: three files' (`active-challenges.test.ts`, `live-snapshot.test.ts`, `app/page.test.ts`) `afterEach` blanket-deleted the whole shared, migration-seeded `challenge_definitions` table instead of only the rows each file itself inserted, corrupting state for any test file that ran afterward. Fixed by tracking each file's own inserted definition ids and deleting only those - necessary here since this ticket's own new integration tests (and several pre-existing ones) depend on the seeded rows surviving across a full suite run.

Verified via new tests (`admin-config.test.ts`, `[adminSecret]/page.test.ts`, plus the six `match-tracker.test.ts` integration tests) and a manual pass in a real browser (secret-gated 404 vs 200, an end-to-end XP-reward edit through the actual form, and a scroll-through of every section). Full suite (336 tests) and typecheck pass, run twice back to back to confirm no order-dependent flakiness remained.
