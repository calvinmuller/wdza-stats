Status: done

# 01: Seasons exist and the worker records PlayerSeasonStat

**What to build:** The site gains a notion of **Season** and starts keeping a **PlayerSeasonStat** per player per Season per Server, alongside PlayerCareerStat. On deploy, Season 1 exists, every existing Match belongs to it, and every player's Season 1 totals equal their career totals exactly. From then on the worker keeps season totals in step with career totals, attributing everything to the Season of the Match it happened in. Nothing user-facing changes yet. See `.scratch/seasons/spec.md` and the **Season** / **PlayerSeasonStat** entries in `CONTEXT.md`.

**Blocked by:** None (can start immediately).

- [x] A Season has a number, an optional name, and the moment it started. Season 1 is created by the migration, with a start no later than the earliest Match.
- [x] Every Match records the Season it belongs to; existing Matches are assigned to Season 1. A newly opened Match is assigned to the Season current at the moment it opens.
- [x] PlayerSeasonStat holds kills, deaths, cash, matches played/won/lost, MVP count, highest KillStreak, and season XP, keyed by Season + Server + steamId, with indexes supporting the same rankings sorts PlayerCareerStat supports (xp, kills, matches won, highest KillStreak).
- [x] The migration backfills Season 1 PlayerSeasonStat rows as an exact copy of each PlayerCareerStat's corresponding totals.
- [x] On Match close, the same deltas added to PlayerCareerStat are added to the PlayerSeasonStat of the Match's Season, in the same transaction.
- [x] Each XP ledger insert adds to the season XP of the Season of the Match its GameEvent belongs to (not wall-clock time, not the insert timestamp) — including daily Challenge completion XP.
- [x] Highest KillStreak updates apply to the Match's Season as well as career.
- [x] Level and Achievements are untouched: level still derives from career XP; `veteran`/`champion` still read career totals.
- [x] Test: with only Season 1, after a Match closes, the player's Season 1 totals equal their career totals.
- [x] Test: with a Match open in Season 1, inserting Season 2 directly and then closing that Match credits Season 1 (not Season 2); the next Match opened is in Season 2, and after it closes Season 2 totals hold only that Match while career holds both.
- [x] Test: XP earned from GameEvents of a Season 1 Match after Season 2 has begun is credited to Season 1's season XP.

## Comments

Implemented (uncommitted at time of writing). See `packages/db/migrations/0030_seasons.sql`, `packages/db/src/schema.ts` (`seasons`, `matches.seasonId`, `playerSeasonStats`), and `apps/worker/src/match-tracker.ts` (`closeMatch`, `applyKillStreakUpdates`, `applyXpTransactionDrafts`, `ingestSnapshot`).

- `matches.season_id` defaults to a `current_season_id()` SQL function (highest-numbered Season), so every Match insert, the worker's and the ~30 direct inserts in tests alike, is stamped with the Season current when it opened, without each caller passing it. The worker reads the Match's `seasonId` back rather than choosing it.
- Season XP is attributed by looking up the Season of each inserted XpTransaction's GameEvent's Match. Highest KillStreak uses the open Match's Season.
- `player_season_stats` has no displayName/level/currentKillStreak: read the name from career, derive level from career XP.
- Like career rows, a season row can exist with `matches_played = 0` (a kill in a still-open Match creates it). Season leaderboards (ticket 04 onwards) should filter on `matches_played > 0` to honour "only players who played a Match in that Season".
- The migration was verified against a scratch database with existing matches and career rows: Season 1 starts at the earliest Match, all existing Matches land in Season 1, and the Season 1 rows are an exact copy of the career rows.
- The two integration tests in `match-tracker.test.ts` ("Seasons: …") cover the three test bullets above (the XP-after-new-Season case is part of the second test).
- **Deploy note:** run the migration with the worker stopped (or deploy the worker right after). An old worker polling between migration and deploy would bump career totals but not Season 1's.
- Full suite: 721 passed. 3 KickVote tests (`app/page.test.ts`, `api/kick/[id]/stream/route.test.ts`) fail with "Pick a reason for the KickVote", and they fail identically on master without these changes.
