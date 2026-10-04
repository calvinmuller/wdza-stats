Status: done

# 04: Season picker on /rankings and the leaderboards API

**What to build:** `/rankings` shows the current Season by default, with a Season picker offering the current Season, each past Season, and Career; the choice is reflected in the URL so it can be shared. Season views rank only players who played a Match in that Season, by season XP / kills / matches won / highest KillStreak; level shown is still the career level. `/api/leaderboards/[metric]` keeps returning Career by default and accepts `?season=N` or `?season=current`. This ticket introduces the shared Season picker and Season-resolving logic that tickets 05–07 reuse. See `.scratch/seasons/spec.md`.

**Blocked by:** 01 (Seasons exist and the worker records PlayerSeasonStat).

- [x] A reusable Season picker component lists the current Season (labelled with its number and name, if any), past Seasons newest first, and Career.
- [x] A shared way to resolve a `season` query value (`current`, a number, or absent) into either a Season or Career, rejecting unknown Season numbers with a clear not-found rather than silently falling back.
- [x] `/rankings` defaults to the current Season; selecting Career shows exactly what the page shows today.
- [x] Season rankings remain paginated in SQL and include only players who played a Match in that Season on that Server (a PlayerSeasonStat with matches played > 0; a row can exist earlier, created by a kill in a still-open Match - see ticket 01 Comments).
- [x] Level displayed in season rankings is derived from career XP, never season XP.
- [x] `/api/leaderboards/[metric]` with no `season` param returns the same response as before this change; with `?season=` returns that Season's rankings.
- [x] Test: with two Seasons, season rankings and career rankings differ as expected, and a player with no Matches in the current Season is absent from its rankings but present in Career.

## Comments

Implemented. See `apps/web/src/lib/season-scope.ts` (`resolveSeasonScope`), `apps/web/src/lib/season-param.ts` (`SeasonScope`, `seasonScopeParam`, `seasonLabel`), `apps/web/src/components/season-picker.tsx` (`SeasonPicker`), and `apps/web/src/lib/rankings.ts` (`getRankings` takes a `SeasonScope`, Career by default).

- `season` query values: absent (the caller's default), `current`, `career`, or a Season number. Anything else, including an unknown number, resolves to null: the page calls `notFound()`, and the API answers 404 `{ error: "Unknown season: N" }`. Pages pass `"current"` as the default and the API passes `"career"`.
- The picker links each Season by its number (never `current`), so a shared link keeps showing that Season after the next one starts. /rankings' metric and pagination links carry the `season` param too.
- `season-param.ts` and the picker import only types from `@wdza-stats/db`. Tickets 05–07 can render the picker from a `"use client"` table (e.g. `leaderboard-table.tsx`) without pulling the db package into the client bundle. Keep `resolveSeasonScope` server-side.
- Season rankings come from `player_season_stats` (filtered to `matches_played > 0`, banned players excluded), inner-joined to the career row for the display name and the career XP that level is derived from.
- A Season-scoped API response gains `season: { number, name, startedAt }`. Career responses carry no `season` field, so the default response is unchanged.
- Full suite: 748 passed. The 3 known KickVote failures ("Pick a reason for the KickVote") are unchanged.
