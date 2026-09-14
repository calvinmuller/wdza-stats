# 03: Faction score events

**What to build:** GameEvents that track how a Match's Faction scores move: `FactionScoreChanged` whenever any Faction's running score changes between consecutive Snapshots, and `FactionTookLead` when a Faction becomes the sole highest-scoring Faction by strictly overtaking the previous leader — a tie never counts as a lead change, and the prior leader keeps the lead until someone strictly passes them.

**Blocked by:** 01: Event log foundation + player join/leave detection

**Status:** ready-for-agent

- [ ] `FactionScoreChanged` fires for each Faction whose score differs between two consecutive Snapshots within the same Match, carrying old and new score in metadata
- [ ] `FactionTookLead` fires only when a Faction's score strictly exceeds every other Faction's current score and it was not already the sole leader
- [ ] A score change that produces a tie for the lead does not fire `FactionTookLead`, and does not change which Faction is considered "leading" for the purpose of the next comparison
- [ ] Idempotent against retried snapshot comparisons
- [ ] Tests cover: a normal score increase, two Factions tying, and a Faction overtaking a tie to take sole lead
