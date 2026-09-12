# 06: Web: leaderboards & player lookup

**What to build:** The public leaderboard and player-lookup pages that make this a "stats site" rather than just a live mirror — letting visitors see who's actually good on the server, all-time.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] A public leaderboard page lists players ranked by kills, deaths, K/D ratio, and cash (switchable), scoped to the configured Server, all-time totals only (no seasons/resets)
- [ ] Each leaderboard row shows the player's display name and Faction-appropriate styling/color where applicable
- [ ] A player lookup (by name, or a direct link) shows that player's all-time totals: kills, deaths, K/D ratio, cash, matches played
- [ ] Pages render correctly and remain usable at phone width
- [ ] No authentication is required to view any of these pages
- [ ] Test seam: seeding Postgres with known `PlayerCareerStat` rows and requesting the leaderboard/lookup routes returns response content with the correct ranking/values, without going through the Worker
