Status: ready-for-agent

# 03: Admin withdraws a just-started Season

**What to build:** If a Season was started by mistake, an admin can withdraw it — but only until its first Match closes. Withdrawing makes the previous Season current again, moves any Matches already opened in the withdrawn Season back to the previous Season, and folds anything those open Matches have already accrued (season XP, highest KillStreak) back into the previous Season's totals, so no player's numbers are lost. Once any Match in the new Season has closed, the option is gone. See `.scratch/seasons/spec.md`.

**Blocked by:** 02 (Admin starts a new Season).

- [ ] Only the `admin` Role can withdraw, and only the current Season, and only while it has no closed Match; otherwise the action is unavailable in the UI and rejected server-side.
- [ ] Season 1 can never be withdrawn.
- [ ] Withdrawing reassigns the withdrawn Season's open Matches to the previous Season.
- [ ] Any season XP accrued in the withdrawn Season is added to the previous Season's season XP for the same player and Server; highest KillStreak takes the greater of the two. The withdrawn Season and its PlayerSeasonStat rows are then removed.
- [ ] Career totals are unaffected by withdrawing.
- [ ] Withdrawal is guarded against racing a Match close (a Match closing concurrently either blocks the withdrawal or is credited correctly — never lost or double-counted).
- [ ] Withdrawing is recorded in the staff audit log.
- [ ] Test: start Season 2, open a Match and earn XP in it, withdraw; the Match closes into Season 1 and the earlier XP is in Season 1's season XP.
- [ ] Test: once a Season 2 Match has closed, withdrawal is rejected.
