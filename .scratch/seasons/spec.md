Status: ready-for-agent

# Seasons: per-Season player stats alongside career totals

## Problem Statement

Wardogs Season 2 starts on 15 October 2026. Today every stat on the site is all-time (`.scratch/wdza-stats-v1/spec.md` deliberately shipped "no seasons/resets"), so there is no way to see who is leading *this* Season, and no way to look back at how Season 1 finished once Season 2 is under way.

## Solution

Introduce **Season** and **PlayerSeasonStat** (see `CONTEXT.md`). Career totals (PlayerCareerStat) carry straight on across Seasons and remain the sum of every Season; each Season additionally gets its own per-player totals. An admin starts a new Season by hand, and the public stats pages default to the current Season with a picker for past Seasons and Career.

## Domain Decisions (from grilling + domain-modeling session)

- **Career is not archived or reset.** PlayerCareerStat stays exactly as it is: the total over every Season. A Season adds a layer; it never subtracts one.
- **Seasons are global**, shared by every Server. PlayerSeasonStat is still scoped per Server, like PlayerCareerStat.
- **Seasons are back to back**: each ends exactly when the next begins, so there is always exactly one current Season. Season 1 is everything before Season 2 began.
- **Started by hand.** An admin presses "Start Season N" (number auto-increments, optional name, confirmation step naming the Season). There is no scheduled start date; a Season's start is the moment it was actually started.
- **A Match belongs to the Season current when it started.** A Match is never split: one in progress when a new Season begins counts towards the old Season in full — including the XP and KillStreaks earned during it.
- **Withdrawal**: a just-started Season can be withdrawn only until its first Match closes. Its open Matches (and anything they have accrued) move back to the previous Season.
- **What is per-Season**: kills, deaths, cash earned, matches played/won/lost, MVP count, highest KillStreak, XP earned in the Season.
- **What stays career-long**: level (always derived from career XP — nobody gets demoted), Achievements (once per Server, ever; `veteran`/`champion` keep reading career totals), current KillStreak (already per-Match). Daily Challenges are unaffected.
- **PlayerSeasonStat exists only for players who played a Match in that Season.** Season leaderboards list only those players.
- **Defaults**: `/leaderboard`, `/rankings`, `/stats`, and the player page's stat tiles default to the current Season, with a picker (current / past Seasons / Career). The player page's level/XP bar stays career-long. A player with no current-Season stats sees "No matches yet in Season N" with a link to Career.
- **Public API defaults to Career** for backward compatibility; `?season=N` or `?season=current` opts in. Applies to `/api/leaderboards/...` and `/api/players/...`.
- **No announcement** beyond the Season label on the pages (a Season start is an admin act, not a gameplay inference, so it is not a Notification).

## Implementation Decisions

- **PlayerSeasonStat is stored as running totals**, updated by the worker at the same points and in the same transaction as PlayerCareerStat (match close, XP ledger inserts, KillStreak updates). Chosen over computing season windows on read: it mirrors the existing career pattern, keeps `/rankings` SQL-paginated, and avoids adding time/steamId indexes to `player_match_stats`, `game_events`, and `xp_transactions`.
- **Matches carry their Season**, assigned when the Match opens. Season attribution for XP and KillStreaks follows the Match the underlying GameEvent belongs to — never wall-clock time or `xp_transactions.created_at`.
- **Season 1 is backfilled from career**: until Season 2 exists, every PlayerSeasonStat for Season 1 equals the player's PlayerCareerStat exactly, and every existing Match belongs to Season 1.
- All history (matches, player match stats, game events, XP ledger) is retained indefinitely, so PlayerSeasonStat can always be rebuilt from history if it ever drifts.

## Out of Scope

- Season-scoped Challenges (the reserved "season" Challenge scope stays unbuilt).
- End-of-Season recognition (champion titles, badges, rewards).
- A site-wide "Season N has begun" notice.
- Scheduled/automatic Season starts.
