Status: done

# 05: Season picker on /leaderboard

**What to build:** `/leaderboard` (kills, deaths, K/D, cash, playtime sorts) shows the current Season by default, with the shared Season picker for past Seasons and Career. In a Season view, only players who played a Match in that Season appear, and the K/D shrinkage toward the average uses that Season's average and that Season's matches played rather than career figures. See `.scratch/seasons/spec.md`.

**Blocked by:** 04 (Season picker on /rankings and the leaderboards API) — reuses its picker and Season resolution.

- [x] `/leaderboard` defaults to the current Season; Career shows exactly what the page shows today.
- [x] Season view reads PlayerSeasonStat for the chosen Season and Server; players with no PlayerSeasonStat for it are absent.
- [x] K/D shrinkage in a Season view uses that Season's server-wide average and each player's season matches played.
- [x] Playtime column: either shown for the Season if derivable, or clearly labelled as career playtime — decide during implementation and note it in Comments.
- [x] The selected Season survives changing the sort (URL carries both).
- [x] Test: with two Seasons, the K/D ordering in a Season view is computed from season figures only.

## Comments

Implemented. See `apps/web/src/lib/leaderboard.ts` (`getLeaderboard` takes a `SeasonScope`, Career by default) and `apps/web/src/app/leaderboard/page.tsx`.

- **Playtime: labelled as all-time, not per Season.** The column is `steam_profiles.playtime_minutes` (Steam's `playtime_forever` for the account), and nothing stores a player's time in a Match: `player_match_stats` has no join/leave times, a Match's own length overstates anyone who joined partway, and `match_snapshots` are deleted when a Match closes. So in a Season view, the column header and the sort link read "Playtime (all-time)", and the K/D note says playtime is Steam's all-time figure. Career keeps the plain "Playtime" label.
- The Season view lists PlayerSeasonStat rows with `matches_played > 0` for the chosen Season and Server. K/D shrinkage runs over those rows, so both the average and each player's matches played are that Season's.
- `apps/web/src/lib/season-stats.ts` (`playedInSeason`, `careerStatOfSeasonStat`) holds the "played a Match in this Season" filter and the join to the career row (for name and career XP). /rankings and /leaderboard both use them. Tickets 06–07 should too.
- Sort links and picker links carry both `season` and `sort`. An unknown `?season=` is a 404, as on /rankings.
- Full suite: 755 passed. The 3 known KickVote failures ("Pick a reason for the KickVote") are unchanged.
