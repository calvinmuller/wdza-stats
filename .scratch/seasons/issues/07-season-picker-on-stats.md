Status: done

# 07: Season picker on /stats

**What to build:** The server-wide `/stats` page (total closed Matches, total kills/deaths, unique players, wins per Faction) shows the current Season by default, with the shared Season picker for past Seasons and Career. See `.scratch/seasons/spec.md`.

**Blocked by:** 04 (Season picker on /rankings and the leaderboards API) — reuses its picker and Season resolution.

- [x] `/stats` defaults to the current Season; Career shows exactly what the page shows today.
- [x] Season totals count only closed Matches belonging to that Season; unique players counts players with a PlayerSeasonStat for that Season and Server; Faction wins count only that Season's Matches.
- [x] Test: with two Seasons, each Season's totals sum to the Career totals.

## Comments

Implemented. See `getServerStats` in `apps/web/src/lib/server-stats.ts` (it takes a `SeasonScope`, Career by default) and `apps/web/src/app/stats/page.tsx`, which defaults to the current Season, shows the Season picker, and returns a 404 for an unknown `?season=`.

- **Matches and Faction wins:** closed Matches with `matches.season_id` = the Season. An open Match counts toward no Season until it closes.
- **Kills and deaths:** summed over every PlayerSeasonStat row for the Season and Server, including a row with `matches_played = 0`, whose kills come from a still-open Match. Career counts those kills too, so each Season's totals add up to Career's. Leaving them out would break that.
- **Unique players:** in a Season, players with a PlayerSeasonStat that has `matches_played > 0` (ticket 01's rule, as on the leaderboards). Career counts every PlayerCareerStat row, as before. Unique players don't add up across Seasons, because one player can play in several.
- Banned players are left out in both views, as before.
