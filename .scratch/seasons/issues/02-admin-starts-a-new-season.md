Status: done

# 02: Admin starts a new Season

**What to build:** An admin can start the next Season by hand from the admin area: they see the current Season, optionally enter a name for the next one, confirm through a step that names it ("Start Season 2 now? Every leaderboard will switch to Season 2"), and the new Season becomes current immediately. Matches that open afterwards count towards it; Matches already in progress finish in the previous Season. This is the minimum needed for 15 October. See `.scratch/seasons/spec.md`.

**Blocked by:** 01 (Seasons exist and the worker records PlayerSeasonStat).

- [x] Only the `admin` Role can start a Season; moderators and signed-out visitors cannot (enforced server-side, not just hidden in the UI).
- [x] The next Season's number is always the current Season's number + 1; the admin cannot choose it. The name is optional.
- [x] Starting requires an explicit confirmation step naming the Season number (and name, if given).
- [x] The new Season's start is recorded as the moment it was started, and it becomes the current Season for every Server at once.
- [x] Two admins pressing start at the same time cannot create two Seasons with the same number or two current Seasons.
- [x] Starting a Season is recorded in the staff audit log like other staff actions.
- [x] The admin page lists past Seasons with their numbers, names, and start dates.
- [x] Test: a Match open when the Season is started is credited to the previous Season on close; a Match opened afterwards is credited to the new Season.
- [x] Test: a non-admin attempt to start a Season is rejected and creates nothing.

## Comments

Implemented. See `packages/db/src/season.ts` (`startNextSeason`, `currentSeason`, `listSeasons`) and `apps/web/src/app/admin/seasons/` (admin-only page under the new "Seasons" nav item, `startSeasonAction`, `StartSeasonForm`).

- The form posts the Season number the admin confirmed (hidden field). `startNextSeason` refuses anything but current + 1, so a stale page or a second admin's click is refused ("Season N has already been started") instead of starting the Season after.
- Concurrent starts are serialised by `LOCK TABLE seasons IN SHARE ROW EXCLUSIVE MODE` inside the transaction; the lock blocks other starts but not reads or the Worker's Match inserts. The `seasons_number_unique` constraint backs it up. A repeated race test fails without the lock.
- `startedAt` uses the database clock (column default), like Season 1's and every Match's.
- The confirmation is the existing `ActionForm` `window.confirm`, built from the name as typed: "Start Season 2 (Dust Storm) now? Every leaderboard will switch to Season 2. Matches already in progress finish in the current Season."
- Audit action `start_season`, target = Season number, detail = `{ name }`. Recorded after the start commits, the same way as the other staff actions.
- Names are capped at 60 characters (`SEASON_NAME_MAX_LENGTH`).
- The worker test from ticket 01 ("credits a Match open when a new Season starts…") now calls the real `startNextSeason`. It covers the first test bullet. `apps/web/src/app/admin/seasons/seasons.test.ts` covers the non-admin bullet.
- Ticket 03 (withdraw) should take the same table lock in its transaction.
- Full suite: 734 passed. The 3 known KickVote failures ("Pick a reason for the KickVote") are unchanged.
