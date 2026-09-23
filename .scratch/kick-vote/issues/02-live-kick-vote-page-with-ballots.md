# 02: Live `/kick/{id}` page where visitors cast Ballots

**What to build:** Opening the shared `wdza.gg/kick/{id}` link shows the target, reason, live Ballot count against the threshold, and a countdown to `endsAt`. A visitor can cast exactly one Ballot — no retraction — and the page updates live for everyone watching, without a refresh, following the same Postgres NOTIFY/SSE pattern as the live kill feed (`apps/web/src/app/api/live-kills/stream/route.ts`, `apps/web/src/lib/kill-notifications.ts`). See `.scratch/kick-vote/spec.md` and `CONTEXT.md`'s **KickVoteBallot** entry.

**Blocked by:** 01 (needs a KickVote to exist to view and vote on).

- [ ] `GET /kick/{id}` renders the target name, reason, live Ballot count vs. `threshold`, and time remaining until `endsAt`, derived from the vote's own `serverId` (no separate server param needed).
- [ ] A "vote" action inserts a `kickVoteBallots` row keyed on `(kickVoteId, sessionId)`; casting again from the same session is a no-op, not an error, and there is no way to remove a cast Ballot.
- [ ] The page identifies "this session" via the same per-session token mechanism used for the initiator cooldown in ticket 01 (one mechanism, not two).
- [ ] The target's own session (if it matches the KickVote's `targetSteamId`'s session, if determinable — otherwise document the limitation) cannot cast a Ballot on its own kick.
- [ ] Ballot counts update live on the page for other open tabs/viewers via NOTIFY/SSE, without polling.
- [ ] A KickVote that is not `active` (already resolved) renders its final state instead of a voting UI.
- [ ] Test: two ballot casts from the same session produce exactly one `kickVoteBallots` row.
