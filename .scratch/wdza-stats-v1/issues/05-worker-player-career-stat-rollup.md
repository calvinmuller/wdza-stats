# 05: Worker: PlayerCareerStat rollup

**What to build:** Turn per-Match player stats into fast, queryable career totals, so leaderboards never need to sum every historical Match on every page view.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] The moment a Match closes and its `PlayerMatchStat` rows are written, each affected player's `PlayerCareerStat` for that Server is upserted: kills/deaths/cash incremented by that Match's deltas, `matchesPlayed` incremented by 1
- [ ] `PlayerCareerStat` is keyed by `(serverId, steamId)` — the same steamId gets independent totals on different Servers
- [ ] `displayName` on `PlayerCareerStat` is updated to the player's most recently observed in-game name each time their stat is touched
- [ ] A player's very first closed Match correctly creates their `PlayerCareerStat` row rather than requiring it to pre-exist
- [ ] Test seam: given a sequence of closed Matches with known `PlayerMatchStat` rows (built via the fake-RCON-client Worker seam from ticket 04, or constructed directly), the resulting `PlayerCareerStat` rows match the expected running totals, including for a player who appears across multiple Matches
