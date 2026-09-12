# 04: Worker: Match-boundary detection & persistence

**What to build:** The core domain logic that turns the raw Snapshot stream into real history: detecting when one Match has ended and another has begun, and persisting each closed Match with accurate per-player stats — entirely inferred from Snapshot comparisons, since the RCON API sends no explicit match-end event (see `docs/adr/0001-infer-match-boundaries-from-snapshot-deltas.md`).

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Comparing each new Snapshot to the previous one for the same Server, a new Match is detected to have begun when: `map` changes, `rotation.nowIndex` changes, or any player's `kills`/`deaths`/`cash` value is lower than that same player's value in the prior Snapshot
- [ ] `lighting` and `alternator` changes alone do NOT trigger a Match boundary
- [ ] On detecting a boundary, the previous Match is closed: for every steamId observed in at least one Snapshot during that Match, a `PlayerMatchStat` row is written with `delta = (value at player's last Snapshot in the Match) - (value at player's first Snapshot in the Match)` for kills, deaths, and cash independently
- [ ] A player's Faction on their `PlayerMatchStat` row is whichever Faction they were on at their last Snapshot within that Match (covers mid-Match Faction switches)
- [ ] A new Match row is opened starting from the Snapshot that triggered the boundary
- [ ] Raw Snapshots belonging to a Match are not retained once that Match closes and its `PlayerMatchStat` rows are persisted — only Match-level and player-stat rows are kept long-term
- [ ] If the Worker resumes after a gap in polling and observes state inconsistent with a clean continuation, it closes any still-open Match using the last-known-good Snapshot and opens a new Match from the first post-gap Snapshot, using the same boundary logic — no separate "gap" concept needed
- [ ] Test seam (fake RCON client, scripted Snapshot sequences, real test Postgres, assertions on resulting rows) covers at minimum: a normal single Match with no boundary, a mid-Match Faction switch, a same-map restart via counter reset, a map/rotation change, and a simulated polling gap
