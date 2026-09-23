Status: done

# 03: Resolve a KickVote — success kicks, expiry/target-leaving end it without one

**What to build:** The full KickVote lifecycle resolves correctly and is reflected live on `/kick/{id}`, with no further in-game broadcast (per `.scratch/kick-vote/spec.md`): reaching the threshold before `endsAt` triggers a real RCON kick; the window elapsing first ends the vote as `expired`; the target dropping out of the Server's live Snapshot before either ends it as `targetLeft`. See `packages/db/src/kick-vote.ts`'s `KickVoteStatus` doc comment for the exact state semantics.

**Blocked by:** 02 (needs the Ballot-casting path to be able to reach threshold).

- [x] Casting a Ballot that brings the count to `threshold` while `status: "active"` and before `endsAt`: calls the `kickPlayer` RCON wrapper (ticket 01) with the target's steamId, then sets `status: "succeeded"` and `resolvedAt`.
- [x] A periodic sweep (mirroring the existing worker poll cadence) ends any `active` KickVote past its `endsAt` with insufficient Ballots as `status: "expired"`.
- [x] The same sweep (or the Snapshot-ingest path directly) ends any `active` KickVote whose `targetSteamId` is no longer present in that Server's latest Snapshot as `status: "targetLeft"`, with no RCON kick call.
- [x] Resolution is race-safe: a threshold-crossing Ballot and the expiry/target-left sweep can't both resolve the same KickVote (the DB's one-active-per-Server index plus an atomic status transition, e.g. `UPDATE ... WHERE status = 'active'`, should be enough — no new column needed to prevent a double-resolve).
- [x] The `/kick/{id}` page reflects each terminal status distinctly (not a generic "ended") the moment it resolves, via the same live mechanism as ticket 02.
- [x] Test: a Ballot that crosses the threshold after `endsAt` has already passed does not trigger a kick (expiry wins the race).
- [x] Test: `targetLeft` never calls the kick RCON wrapper.

## Comments

Implemented in apps/worker/src/kick-vote-engine.ts (resolveKickVote, sweepKickVotes, startKickVoteResolver), wired in apps/worker/src/index.ts; castBallot in apps/web/src/lib/kick-vote.ts rejects Ballots after endsAt. Deviations from the ticket's wording: the atomic `succeeded` claim happens *before* the kickPlayer call (race safety), and a failed kick reverts the vote to `active` for the next sweep to retry. `targetLeft` takes precedence over a reached threshold (nothing left to kick). Expiry/targetLeft show up to one sweep (~15s) late, plus one Snapshot poll for targetLeft. Passed /code-review (standards + spec). Known leftovers: castBallot's endsAt check uses the web process's clock while castAt uses the DB's (small drift window); the Worker wakes on its own resolution notifications (harmless no-op).
