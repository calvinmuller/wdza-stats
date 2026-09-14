# 11: Leaderboard API + page

**What to build:** `GET /api/leaderboards/{xp,kills,wins,streaks}`, each paginated and returning pre-computed rank (the frontend never computes ranking), plus the dashboard leaderboard page rendering all four, scoped to the configured Server, styled to match the existing site.

**Blocked by:** 01: Event log foundation + player join/leave detection, 04: Kill streak tracking, 05: XP ledger + XP awards, 07: Match finalization: MVP + win/loss rollup

**Status:** ready-for-agent

- [ ] All four leaderboard endpoints exist, paginated, each row including rank, steamId, displayName, and the relevant metric
- [ ] Rank is computed server-side; the frontend only renders it
- [ ] The leaderboard page renders all four views, scoped to the one configured Server, matching the existing site's design system
- [ ] Sensible database indexes exist for each sort column so pagination doesn't degrade with data volume
- [ ] Tests cover: correct ranking/ordering for each leaderboard type and correct pagination behavior at a page boundary
