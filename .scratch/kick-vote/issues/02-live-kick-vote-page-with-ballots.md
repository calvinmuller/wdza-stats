Status: done

# 02: Live `/kick/{id}` page where visitors cast Ballots

**What to build:** Opening the shared `wdza.gg/kick/{id}` link shows the target, reason, live Ballot count against the threshold, and a countdown to `endsAt`. A visitor can cast exactly one Ballot — no retraction — and the page updates live for everyone watching, without a refresh, following the same Postgres NOTIFY/SSE pattern as the live kill feed (`apps/web/src/app/api/live-kills/stream/route.ts`, `apps/web/src/lib/kill-notifications.ts`). See `.scratch/kick-vote/spec.md` and `CONTEXT.md`'s **KickVoteBallot** entry.

**Blocked by:** 01 (needs a KickVote to exist to view and vote on).

- [x] `GET /kick/{id}` renders the target name, reason, live Ballot count vs. `threshold`, and time remaining until `endsAt`, derived from the vote's own `serverId` (no separate server param needed).
- [x] A "vote" action inserts a `kickVoteBallots` row keyed on `(kickVoteId, sessionId)`; casting again from the same session is a no-op, not an error, and there is no way to remove a cast Ballot.
- [x] The page identifies "this session" via the same per-session token mechanism used for the initiator cooldown in ticket 01 (one mechanism, not two).
- [x] The target's own session (if it matches the KickVote's `targetSteamId`'s session, if determinable — otherwise document the limitation) cannot cast a Ballot on its own kick. **Not enforced, documented as designed**: sessions are anonymous per-browser cookie tokens with no link to a steamId anywhere in this codebase (no player ever authenticates), so which session "is" the target isn't determinable - see the doc comment on `castBallot` in `apps/web/src/lib/kick-vote.ts`.
- [x] Ballot counts update live on the page for other open tabs/viewers via NOTIFY/SSE, without polling.
- [x] A KickVote that is not `active` (already resolved) renders its final state instead of a voting UI.
- [x] Test: two ballot casts from the same session produce exactly one `kickVoteBallots` row.

## Comments

Implemented in commit 4a75433 (`.next/dev`-style artifact churn aside). See apps/web/src/lib/kick-vote.ts, apps/web/src/lib/kick-vote-notifications.ts, apps/web/src/app/api/kick/[id]/stream/route.ts, apps/web/src/app/kick/[id]/page.tsx, apps/web/src/app/kick/[id]/kick-vote-ballot-panel.tsx. Passed /code-review (standards + spec axes); one standards judgement call (KickVoteBallotPanel duplicating ActionForm's logic) was fixed by giving ActionForm an optional onSuccess callback.
