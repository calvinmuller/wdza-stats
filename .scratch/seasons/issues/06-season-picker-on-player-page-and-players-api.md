Status: ready-for-agent

# 06: Season picker on the player page and players API

**What to build:** A player's page shows their current-Season stat tiles by default (kills, deaths, K/D, matches played/won/lost, highest KillStreak, MVPs), with the shared Season picker for past Seasons and Career. The level/XP progress bar and Achievements stay career-long regardless of the picker. A player with no Matches in the selected Season sees "No matches yet in Season N" with a link to their Career stats instead of zeroed tiles. The `/api/players/...` endpoints keep returning Career by default and accept `?season=N` or `?season=current`. See `.scratch/seasons/spec.md`.

**Blocked by:** 04 (Season picker on /rankings and the leaderboards API) — reuses its picker and Season resolution.

- [ ] Player page stat tiles default to the current Season; Career shows exactly what the page shows today.
- [ ] Level, XP progress bar, and Achievements are unchanged by the picker.
- [ ] Empty state "No matches yet in Season N" with a link to the Career view when the player has no PlayerSeasonStat for the selected Season.
- [ ] `/api/players/[steamId]/stats` (and `/api/players?steamIds=` where it returns stats) default to Career and honour `?season=`; a player with no stats for the requested Season gets an explicit empty/absent result, not a 404 of the player.
- [ ] Endpoints that are inherently career-long (progression, achievements) ignore or reject `season` consistently — decide and document in Comments.
- [ ] Test: a player who played only in Season 1 shows the empty state for Season 2 and full tiles for Season 1 and Career.
