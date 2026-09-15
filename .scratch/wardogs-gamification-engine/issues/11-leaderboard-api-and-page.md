# 11: Leaderboard API + page

**What to build:** `GET /api/leaderboards/{xp,kills,wins,streaks}`, each paginated and returning pre-computed rank (the frontend never computes ranking), plus the dashboard leaderboard page rendering all four, scoped to the configured Server, styled to match the existing site.

**Blocked by:** 01: Event log foundation + player join/leave detection, 04: Kill streak tracking, 05: XP ledger + XP awards, 07: Match finalization: MVP + win/loss rollup

**Status:** closed

- [x] All four leaderboard endpoints exist, paginated, each row including rank, steamId, displayName, and the relevant metric
- [x] Rank is computed server-side; the frontend only renders it
- [x] The leaderboard page renders all four views, scoped to the one configured Server, matching the existing site's design system
- [x] Sensible database indexes exist for each sort column so pagination doesn't degrade with data volume
- [x] Tests cover: correct ranking/ordering for each leaderboard type and correct pagination behavior at a page boundary

## Comments

Raised before implementing: should this be a separate leaderboard from the existing `/leaderboard` page (raw career stats: kills, deaths, K/D, cash, playtime), or merged into it?

Decision: kept separate. Built as a new `/rankings` page (its own nav entry) backed by `GET /api/leaderboards/{xp,kills,wins,streaks}` exactly as specified. `/leaderboard` is untouched — same tabs, same unpaginated `getLeaderboard()`, same tests. Reasoning: the two leaderboards have different data shapes (this one is paginated with server-computed rank; the existing one loads every row and ranks by array index) and different concepts (gamification totals we invent vs. Wardogs-reported stats, a split CONTEXT.md's `PlayerCareerStat` entry already draws). Merging would have meant one page juggling two pagination/ranking models across 8 tabs.

Implementation notes:
- New indexes on `player_career_stats(server_id, xp|kills|matches_won|highest_kill_streak)` (migration `0014_skinny_turbo.sql`) back the four sorts.
- "wins" ranks by `matchesWon`; "streaks" ranks by `highestKillStreak` (the all-time best, not `currentKillStreak`, which resets every Match and would mostly read 0 for an all-time board).
- Page size is a fixed 25 (`RANKINGS_PAGE_SIZE`); rank = `(page - 1) * pageSize + index + 1`, computed in `getRankings()` (`apps/web/src/lib/rankings.ts`), never in the client component.
