# 09: Daily challenges

**What to build:** A data-driven challenge system, starting with daily-scoped challenges, designed so weekly/season/server scopes can be added later without a model change. The worker deterministically generates the day's active `ChallengeInstance` rows from `ChallengeDefinition`s (get X kills, win X matches, play X matches, reach X streak, X kills in a match, X kills without dying) — safe against duplicate generation even if triggered more than once. Player progress toward each active challenge is tracked from the relevant GameEvents; reaching the target completes the challenge exactly once and awards its configured XP via ticket 05's ledger.

**Blocked by:** 02: Match lifecycle + kill/death events, 05: XP ledger + XP awards

**Status:** ready-for-agent

- [ ] `ChallengeDefinition`, `ChallengeInstance`, `PlayerChallengeProgress`, and `ChallengeCompletion` models exist, with a `scope` field supporting `daily` today and room for `weekly`/`season`/`server` later
- [ ] Daily challenge generation is deterministic and cannot create duplicate instances for the same day/definition, even if run more than once (e.g. a future second worker instance)
- [ ] Progress updates correctly from the relevant GameEvent types for each challenge type
- [ ] Reaching the target completes the challenge exactly once and awards XP exactly once, even if the qualifying event recurs afterward
- [ ] Tests cover: generation not duplicating, progress incrementing correctly for at least two challenge types, and completion firing exactly once
