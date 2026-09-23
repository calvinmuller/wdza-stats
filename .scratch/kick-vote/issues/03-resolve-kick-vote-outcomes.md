# 03: Resolve a KickVote — success kicks, expiry/target-leaving end it without one

**What to build:** The full KickVote lifecycle resolves correctly and is reflected live on `/kick/{id}`, with no further in-game broadcast (per `.scratch/kick-vote/spec.md`): reaching the threshold before `endsAt` triggers a real RCON kick; the window elapsing first ends the vote as `expired`; the target dropping out of the Server's live Snapshot before either ends it as `targetLeft`. See `packages/db/src/kick-vote.ts`'s `KickVoteStatus` doc comment for the exact state semantics.

**Blocked by:** 02 (needs the Ballot-casting path to be able to reach threshold).

- [ ] Casting a Ballot that brings the count to `threshold` while `status: "active"` and before `endsAt`: calls the `kickPlayer` RCON wrapper (ticket 01) with the target's steamId, then sets `status: "succeeded"` and `resolvedAt`.
- [ ] A periodic sweep (mirroring the existing worker poll cadence) ends any `active` KickVote past its `endsAt` with insufficient Ballots as `status: "expired"`.
- [ ] The same sweep (or the Snapshot-ingest path directly) ends any `active` KickVote whose `targetSteamId` is no longer present in that Server's latest Snapshot as `status: "targetLeft"`, with no RCON kick call.
- [ ] Resolution is race-safe: a threshold-crossing Ballot and the expiry/target-left sweep can't both resolve the same KickVote (the DB's one-active-per-Server index plus an atomic status transition, e.g. `UPDATE ... WHERE status = 'active'`, should be enough — no new column needed to prevent a double-resolve).
- [ ] The `/kick/{id}` page reflects each terminal status distinctly (not a generic "ended") the moment it resolves, via the same live mechanism as ticket 02.
- [ ] Test: a Ballot that crosses the threshold after `endsAt` has already passed does not trigger a kick (expiry wins the race).
- [ ] Test: `targetLeft` never calls the kick RCON wrapper.
