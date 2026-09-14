# 13: Match history API + page

**What to build:** `GET /api/matches` and `GET /api/matches/:id`, plus match history list and detail pages showing map, date, winner, MVP, player count, and top players for each closed Match.

**Blocked by:** 07: Match finalization: MVP + win/loss rollup

**Status:** ready-for-agent

- [ ] `GET /api/matches` returns a paginated list of closed Matches with map, date, winner, MVP, and player count
- [ ] `GET /api/matches/:id` returns full detail for one Match, including top players by kills
- [ ] The match history list and detail pages render this data, matching the existing site's design system
- [ ] Tests cover: correct pagination on the list endpoint and correct detail rendering for a seeded Match
