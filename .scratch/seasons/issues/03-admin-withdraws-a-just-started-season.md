Status: done

# 03: Admin withdraws a just-started Season

**What to build:** If a Season was started by mistake, an admin can withdraw it — but only until its first Match closes. Withdrawing makes the previous Season current again, moves any Matches already opened in the withdrawn Season back to the previous Season, and folds anything those open Matches have already accrued (season XP, highest KillStreak) back into the previous Season's totals, so no player's numbers are lost. Once any Match in the new Season has closed, the option is gone. See `.scratch/seasons/spec.md`.

**Blocked by:** 02 (Admin starts a new Season).

- [x] Only the `admin` Role can withdraw, and only the current Season, and only while it has no closed Match; otherwise the action is unavailable in the UI and rejected server-side.
- [x] Season 1 can never be withdrawn.
- [x] Withdrawing reassigns the withdrawn Season's open Matches to the previous Season.
- [x] Any season XP accrued in the withdrawn Season is added to the previous Season's season XP for the same player and Server; highest KillStreak takes the greater of the two. The withdrawn Season and its PlayerSeasonStat rows are then removed.
- [x] Career totals are unaffected by withdrawing.
- [x] Withdrawal is guarded against racing a Match close (a Match closing concurrently either blocks the withdrawal or is credited correctly — never lost or double-counted).
- [x] Withdrawing is recorded in the staff audit log.
- [x] Test: start Season 2, open a Match and earn XP in it, withdraw; the Match closes into Season 1 and the earlier XP is in Season 1's season XP.
- [x] Test: once a Season 2 Match has closed, withdrawal is rejected.

## Comments

Implemented. See `withdrawSeason` / `withdrawableSeason` in `packages/db/src/season.ts`, `withdrawSeasonAction` in `apps/web/src/app/admin/seasons/actions.ts`, and the "Withdraw Season N" section of the admin Seasons page.

- **When:** only the current Season, never Season 1, and only while none of its Matches has closed (`withdrawalRefusal`, shared by the page and the action). The action posts the Season number the admin confirmed, so a stale page can't withdraw a different Season. The page shows the section only while `withdrawableSeason` returns the Season. The confirm reads: "Withdraw Season N (name)? Season N-1 becomes current again, and every leaderboard will switch back to it."
- **What:** the withdrawn Season's (open) Matches move to the previous Season. Its PlayerSeasonStats fold into the previous Season's: every total is added, and `highestKillStreak` takes the greater (built from the schema's columns, so a new column is folded too). Then those rows and the Season are deleted. Career is never touched. Audit action `withdraw_season`: target is the Season number, detail is `{ name }`.
- **Racing the Worker:** the withdrawal locks `seasons` (as starting does), then `matches` (SHARE ROW EXCLUSIVE), then `player_season_stats` (EXCLUSIVE). That is the order the Worker writes them in, so they can't deadlock.
  - A Match close that comes first makes the withdrawal wait, and the withdrawal is then refused.
  - A close that comes second waits, then reads its Season from `closeMatch`'s `UPDATE … RETURNING`, so it credits the previous Season.
  - A Worker XP or KillStreak upsert that still holds the withdrawn Season's id (read at the top of its poll) fails its foreign key once the Season is gone. The whole poll rolls back (`pollOnce` logs it), and the next poll's diff against the unchanged latest Snapshot picks up the same changes, so nothing is lost or counted twice.
  - Both orders have a test in `packages/db/src/season.test.ts`. Each fails when the `matches` lock is removed.
- Test for the ticket's scenario: `apps/worker/src/match-tracker.test.ts` ("folds a withdrawn Season's open Match…"). Admin-only and audit-log coverage: `apps/web/src/app/admin/seasons/seasons.test.ts`.
- CONTEXT.md: the Role entry now says admins can withdraw a just-started Season. The PlayerSeasonStat entry now says a row can exist, started by a still-open Match, before any Match has been played.

- Full suite: 789 passed. The 3 known KickVote failures ("Pick a reason for the KickVote") are unchanged.
