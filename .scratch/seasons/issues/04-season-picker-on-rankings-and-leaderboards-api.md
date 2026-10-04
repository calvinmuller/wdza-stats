Status: ready-for-agent

# 04: Season picker on /rankings and the leaderboards API

**What to build:** `/rankings` shows the current Season by default, with a Season picker offering the current Season, each past Season, and Career; the choice is reflected in the URL so it can be shared. Season views rank only players who played a Match in that Season, by season XP / kills / matches won / highest KillStreak; level shown is still the career level. `/api/leaderboards/[metric]` keeps returning Career by default and accepts `?season=N` or `?season=current`. This ticket introduces the shared Season picker and Season-resolving logic that tickets 05–07 reuse. See `.scratch/seasons/spec.md`.

**Blocked by:** 01 (Seasons exist and the worker records PlayerSeasonStat).

- [ ] A reusable Season picker component lists the current Season (labelled with its number and name, if any), past Seasons newest first, and Career.
- [ ] A shared way to resolve a `season` query value (`current`, a number, or absent) into either a Season or Career, rejecting unknown Season numbers with a clear not-found rather than silently falling back.
- [ ] `/rankings` defaults to the current Season; selecting Career shows exactly what the page shows today.
- [ ] Season rankings remain paginated in SQL and include only players who played a Match in that Season on that Server (a PlayerSeasonStat with matches played > 0; a row can exist earlier, created by a kill in a still-open Match - see ticket 01 Comments).
- [ ] Level displayed in season rankings is derived from career XP, never season XP.
- [ ] `/api/leaderboards/[metric]` with no `season` param returns the same response as before this change; with `?season=` returns that Season's rankings.
- [ ] Test: with two Seasons, season rankings and career rankings differ as expected, and a player with no Matches in the current Season is absent from its rankings but present in Career.
