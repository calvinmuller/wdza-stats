# 12: Player profile API + page

**What to build:** `GET /api/players/:steamId`, `/stats`, `/achievements`, and `/challenges`, plus the player profile page showing level/XP/progress-to-next-level, lifetime stats, unlocked achievements, current challenge progress, and recent matches/events for that player.

**Blocked by:** 06: Levels + level-up events, 07: Match finalization: MVP + win/loss rollup, 08: Achievement engine, 09: Daily challenges

**Status:** ready-for-agent

- [ ] All four player endpoints exist and return correct, per-Server-scoped data for a given steamId
- [ ] The profile page renders level/XP/progress percentage, lifetime stats (kills, deaths, matchesPlayed/Won/Lost, highest streak, mvpCount), unlocked achievements, current challenge progress, and a recent matches/events list
- [ ] Uses the existing Steam profile data (persona name, avatar) alongside the new gamification data, consistent with how the site already displays players
- [ ] Tests cover: a seeded player's profile returning correct values across all four endpoints, and a player with no gamification activity yet rendering sensible defaults rather than errors
