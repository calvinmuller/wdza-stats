Status: ready-for-agent

# 05: Season picker on /leaderboard

**What to build:** `/leaderboard` (kills, deaths, K/D, cash, playtime sorts) shows the current Season by default, with the shared Season picker for past Seasons and Career. In a Season view, only players who played a Match in that Season appear, and the K/D shrinkage toward the average uses that Season's average and that Season's matches played rather than career figures. See `.scratch/seasons/spec.md`.

**Blocked by:** 04 (Season picker on /rankings and the leaderboards API) — reuses its picker and Season resolution.

- [ ] `/leaderboard` defaults to the current Season; Career shows exactly what the page shows today.
- [ ] Season view reads PlayerSeasonStat for the chosen Season and Server; players with no PlayerSeasonStat for it are absent.
- [ ] K/D shrinkage in a Season view uses that Season's server-wide average and each player's season matches played.
- [ ] Playtime column: either shown for the Season if derivable, or clearly labelled as career playtime — decide during implementation and note it in Comments.
- [ ] The selected Season survives changing the sort (URL carries both).
- [ ] Test: with two Seasons, the K/D ordering in a Season view is computed from season figures only.
