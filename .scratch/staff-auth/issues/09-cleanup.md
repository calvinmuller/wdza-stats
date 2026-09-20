# 09: Cleanup and docs

**What to build:** Remove the leftover secret checks and update everything that mentions the old admin gate.

**Blocked by:** 05, 06, 07

**Status:** closed

- [x] No admin server action or page checks `ADMIN_PATH_SECRET` any longer; only the bootstrap page does
- [x] `.env.example` and the README describe the bootstrap-only use of `ADMIN_PATH_SECRET`
- [x] The comment on `.scratch/wardogs-gamification-engine/issues/15-admin-config-area.md` gets a pointer to this feature
- [ ] The full test suite and typecheck pass (typecheck and `next build` pass, and all 117 staff-related tests pass; the full suite still has 11 to 12 failures that predate this work, see comments)

## Comments

Closed, with one box deliberately left unticked. Cleanup done: nothing outside the bootstrap page and its actions reads `ADMIN_PATH_SECRET` any more (checked by grep; the admin pages and actions were already off it after tickets 05 and 06). `.env.example` and the README (new "Admin access" section, including the three env vars the web service needs) describe the secret as bootstrap-and-recovery only, `lib/admin-secret.ts`'s comment says the same, and ticket 15 has a pointer to this feature.

The unticked box is the full test suite. `npm run typecheck` and `next build` are clean and every staff-related test passes (11 files, 117 tests), but the full suite has 11 to 12 failures, in `live-snapshot`, `player-lookup`, `player-progression`, the leaderboards and players API routes, and `steam-client`. They predate this feature (they were already failing before ticket 01) and none touches staff code. The count moves between runs on the same commit, and comparing the exact failing tests at the tickets 07 and 08 commits showed each had one test the other didn't. Cause, from the error output: leftover rows in the shared test database (a `servers` row still referenced by `player_career_stats` blocks the tests' `delete from "servers"` cleanup), so which tests fail depends on what earlier runs left behind. It needs its own fix; it was out of scope here.

ADR 0003 still says "no real authentication exists yet". That is historical reasoning about RCON writes and was left as written; its conclusion (RCON stays read-only) is unchanged.
