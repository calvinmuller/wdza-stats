# 13: Match history API + page

**What to build:** `GET /api/matches` and `GET /api/matches/:id`, plus match history list and detail pages showing map, date, winner, MVP, player count, and top players for each closed Match.

**Blocked by:** 07: Match finalization: MVP + win/loss rollup

**Status:** closed

- [x] `GET /api/matches` returns a paginated list of closed Matches with map, date, winner, MVP, and player count
- [x] `GET /api/matches/:id` returns full detail for one Match, including top players by kills
- [x] The match history list and detail pages render this data, matching the existing site's design system
- [x] Tests cover: correct pagination on the list endpoint and correct detail rendering for a seeded Match

## Comments

Implementation notes:
- `apps/web/src/lib/match-history.ts`'s `getMatchesPage` replaces the old unpaginated `getRecentMatches`, mirroring `rankings.ts`'s `getRankings` pagination shape (`{page, pageSize, totalCount, totalPages, rows}`). `MatchHistoryView`/`MatchDetailView` both gained `winningFaction`/`mvpPlayerSteamId`/`mvpDisplayName` (plus `mvpScore` on the detail view).
- `getMatchDetail` already sorted players by kills descending, so "top players by kills" falls out of the existing query for free - MVP display name is resolved from that same player list rather than a second query, falling back to the raw steamId the same way the roster's own displayName fallback does.
- Two new route handlers under `apps/web/src/app/api/matches/` match the leaderboards/players routes' try/catch/JSON-error convention (400 for a non-integer match id, 404 for an unknown one).
- The list page distinguishes "no matches recorded yet" (`totalCount === 0`) from "no matches on this page" (a page number past the last one) - the two were conflated in the mirrored `rankings.ts` precedent, and would otherwise show a misleading empty-history message for a stale or hand-edited `?page=`.
- Reviewed via `/code-review` (Standards + Spec sub-agents against `master`). Standards found no hard violations - only judgement-call smells (`parseMatchesPage`/`parseRankingsPage` and the two pages' pagination JSX are near-duplicates, tolerable at two call sites rather than extracted). Spec flagged the empty-state conflation above, fixed before this commit.
