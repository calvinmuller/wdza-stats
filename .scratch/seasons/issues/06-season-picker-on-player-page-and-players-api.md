Status: done

# 06: Season picker on the player page and players API

**What to build:** A player's page shows their current-Season stat tiles by default (kills, deaths, K/D, matches played/won/lost, highest KillStreak, MVPs), with the shared Season picker for past Seasons and Career. The level/XP progress bar and Achievements stay career-long regardless of the picker. A player with no Matches in the selected Season sees "No matches yet in Season N" with a link to their Career stats instead of zeroed tiles. The `/api/players/...` endpoints keep returning Career by default and accept `?season=N` or `?season=current`. See `.scratch/seasons/spec.md`.

**Blocked by:** 04 (Season picker on /rankings and the leaderboards API) — reuses its picker and Season resolution.

- [x] Player page stat tiles default to the current Season; Career shows exactly what the page shows today.
- [x] Level, XP progress bar, and Achievements are unchanged by the picker.
- [x] Empty state "No matches yet in Season N" with a link to the Career view when the player has no PlayerSeasonStat for the selected Season.
- [x] `/api/players/[steamId]/stats` (and `/api/players?steamIds=` where it returns stats) default to Career and honour `?season=`; a player with no stats for the requested Season gets an explicit empty/absent result, not a 404 of the player.
- [x] Endpoints that are inherently career-long (progression, achievements) ignore or reject `season` consistently — decide and document in Comments.
- [x] Test: a player who played only in Season 1 shows the empty state for Season 2 and full tiles for Season 1 and Career.

## Comments

Implemented. See `getPlayerStatsInScope` in `apps/web/src/lib/player-progression.ts`, `apps/web/src/app/players/[steamId]/page.tsx`, and the two players API routes.

- **Player page:** the Season picker (links `/players/<steamId>?season=N|career`) scopes only the stat tiles. Level, the XP bar, Achievements, today's Challenges, recent events, and match history stay as they were. The empty state is "No matches yet in Season N." with a "See career stats" link, and it replaces every tile, Playtime included. In a Season view with tiles, Playtime is labelled "Playtime (all-time)", as on /leaderboard (ticket 05). An unknown `?season=` is a 404.
- **"No PlayerSeasonStat" means no Match played**, not "no row". A kill in a still-open Match creates a row with `matches_played = 0` (ticket 01), so the check uses `playedInSeason` (`matches_played > 0`) from `season-stats.ts`, as the leaderboards do.
- **`GET /api/players/[steamId]/stats`:** with no `season`, the flat Career body is unchanged. With `?season=`, the body is `{ steamId, season: { number, name, startedAt }, stats }`. `stats` is null (200) when the player played no Match in that Season. The Season response is nested rather than flat-plus-`season` (unlike the leaderboards API) because the stats themselves can be absent. An unknown player is still a 404 ("No player found…"), and an unknown Season is a 404 ("Unknown season: N").
- **`GET /api/players?steamIds=`:** with `?season=`, the response gains a top-level `season`, and each player's `stats` is that Season's (null if they played no Match in it). Progression, Achievements, Challenges, and Steam data are career-long whatever the scope.
- **Career-long endpoints ignore `season`.** `/api/players/[steamId]` (progression), `/achievements`, and `/challenges` never read it, so a client that adds `season` to every call isn't broken. Even an unknown Season is ignored there. Tests cover progression and Achievements.
- **`currentKillStreak`** in a Season-scoped stats body is always the live KillStreak from the career row. It is Match-scoped live state (spec: "current KillStreak (already per-Match)"), so in a past Season it is today's streak, not a Season total.
- `apiSeasonScope` in `apps/web/src/lib/season-scope.ts` is the public API's shared `?season=` handling: Career by default, 404 for an unknown Season. `seasonSummary` names the Season in responses. All three API routes use both.
- Full suite: 773 passed. The 3 known KickVote failures ("Pick a reason for the KickVote") are unchanged.
