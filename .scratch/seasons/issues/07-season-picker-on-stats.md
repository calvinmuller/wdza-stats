Status: ready-for-agent

# 07: Season picker on /stats

**What to build:** The server-wide `/stats` page (total closed Matches, total kills/deaths, unique players, wins per Faction) shows the current Season by default, with the shared Season picker for past Seasons and Career. See `.scratch/seasons/spec.md`.

**Blocked by:** 04 (Season picker on /rankings and the leaderboards API) — reuses its picker and Season resolution.

- [ ] `/stats` defaults to the current Season; Career shows exactly what the page shows today.
- [ ] Season totals count only closed Matches belonging to that Season; unique players counts players with a PlayerSeasonStat for that Season and Server; Faction wins count only that Season's Matches.
- [ ] Test: with two Seasons, each Season's totals sum to the Career totals.
