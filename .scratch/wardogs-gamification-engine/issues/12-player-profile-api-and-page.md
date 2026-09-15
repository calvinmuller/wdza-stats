# 12: Player profile API + page

**What to build:** `GET /api/players/:steamId`, `/stats`, `/achievements`, and `/challenges`, plus the player profile page showing level/XP/progress-to-next-level, lifetime stats, unlocked achievements, current challenge progress, and recent matches/events for that player.

**Blocked by:** 06: Levels + level-up events, 07: Match finalization: MVP + win/loss rollup, 08: Achievement engine, 09: Daily challenges

**Status:** closed

- [x] All four player endpoints exist and return correct, per-Server-scoped data for a given steamId
- [x] The profile page renders level/XP/progress percentage, lifetime stats (kills, deaths, matchesPlayed/Won/Lost, highest streak, mvpCount), unlocked achievements, current challenge progress, and a recent matches/events list
- [x] Uses the existing Steam profile data (persona name, avatar) alongside the new gamification data, consistent with how the site already displays players
- [x] Tests cover: a seeded player's profile returning correct values across all four endpoints, and a player with no gamification activity yet rendering sensible defaults rather than errors

## Comments

Implementation notes:
- New `apps/web/src/lib/player-progression.ts` hosts the four view builders backing the endpoints: `getPlayerProgression` (identity + level/xp/progress, derived fresh from `xp` via `levelProgressForXp` rather than trusting `playerCareerStats.level`'s cached copy), `getPlayerStats` (lifetime stats), `getPlayerAchievements`, `getPlayerChallengeProgress`. Named "progression", not "profile" - CONTEXT.md's `PlayerCareerStat` entry explicitly lists `player profile`/`PlayerProfile` as terms to avoid for this data, to stay distinct from the already-existing `SteamProfile` domain concept.
- Existence convention: `getPlayerProgression`/`getPlayerStats` return `null` (404 at the route) only when the steamId has no `PlayerCareerStat` row on the Server at all - i.e. genuinely unknown, matching the player page's pre-existing "no player found" behavior. `getPlayerAchievements`/`getPlayerChallengeProgress` always return a list (empty when there's nothing to show), since "no gamification activity yet" for an existing player is a legitimate, non-error state for a list endpoint - not the same case as an unknown steamId.
- `getPlayerChallengeProgress` mirrors `active-challenges.ts`'s `getActiveChallenges` (today's UTC period via `dailyPeriodKey`) but scoped to one player's own progress/completion instead of every player's aggregate counts.
- Added `getPlayerNotifications` to `recent-notifications.ts` for the page's "recent events" list - joins `notifications` through to `gameEvents` to filter by `steamId`, since `Notification` itself carries no player column. Match-scoped notifications (whose GameEvent has a null steamId) are naturally excluded.
- The page keeps the existing "Steam Achievements" section (from `SteamProfile.achievements`) alongside a new "Achievements" section for the gamification engine's own `PlayerAchievement` unlocks - the two are different domain concepts (ticket 08 vs. the site's existing Steam Web API integration) and both are already-established site conventions worth showing side by side.
- Reviewed via `/code-review` (Standards + Spec sub-agents against `c5d5e87`): Standards flagged the initial `player-profile.ts`/`getPlayerProfile`/`PlayerProfileView` naming as a hard CONTEXT.md violation, fixed by the progression rename above. Spec flagged thin "no gamification activity" test coverage on 3 of 4 endpoints (only `/stats` had it); added matching tests to the root profile endpoint and to `/achievements`/`/challenges` (a player with a `PlayerCareerStat` row but zero unlocked achievements / zero challenge progress).
