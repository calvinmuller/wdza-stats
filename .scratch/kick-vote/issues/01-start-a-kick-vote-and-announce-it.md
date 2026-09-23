Status: done

# 01: Start a KickVote and announce it in-game

**What to build:** From a Server's page, a visitor can pick a currently-online target (from that Server's live `/v1/players` poll data — Staff/admin steamIds excluded), enter a short reason, and start a KickVote. Starting one fires a real in-game RCON broadcast announcing it, with a working link to the vote page. See `.scratch/kick-vote/spec.md`, `CONTEXT.md`'s **KickVote** entry, and `docs/adr/0006-kick-votes-get-a-narrow-rcon-write-exception.md`.

**Blocked by:** None (can start immediately — schema, types, and the ADR are already landed: `packages/db/src/schema.ts`'s `kickVotes`/`kickVoteSettings`/`kickVoteBallots`, `packages/db/src/kick-vote.ts`'s `KickVoteStatus`, migration `0026_kick_votes.sql`).

- [x] `apps/worker/src/rcon-client.ts` gains write wrappers for `POST /v1/players/{steamId}/kick` and `POST /v1/broadcast`; its "no write endpoint is exposed" comment is updated to reflect the ADR 0006 exception.
- [x] A target picker on a Server's page lists only steamIds currently present in that Server's live Snapshot, excluding any Staff Member's steamId. **Partial by explicit product decision**: CONTEXT.md's Staff Member entry states Staff have no steamId at all ("players are only ever a steamId in the stats and never sign in") and the schema has no `staffMembers.steamId` column, so the staff-exclusion half of this item isn't implementable as written and was dropped - the picker lists every currently-online steamId.
- [x] Starting a vote requires a non-empty reason string.
- [x] Starting a vote is blocked with a clear message if the initiating session started another vote within `kickVoteSettings.initiatorCooldownSeconds`.
- [x] Starting a vote is blocked with a clear message if that Server already has an `active` KickVote (the DB's `kick_votes_one_active_per_server_idx` is the backstop, but the UI should not let you get there in the first place).
- [x] A successful start creates a `kickVotes` row with `threshold`/`durationSeconds` snapshotted from `kickVoteSettings`, `startedAt`/`endsAt` set, and `status: "active"`.
- [x] Starting a vote calls the new `broadcast` RCON wrapper with exactly: `Kick vote started against {targetName} - reason: {reason} - vote now: stats.wardogs.co.za/kick`. If only 1 kick vote is active /kick should list the active vote, it there are multiple (per-server) then we should append /{id} to that. Implemented in `apps/worker/src/kick-vote-engine.ts` (not apps/web - see `no-rcon-access.test.ts`): starting a vote writes the row and `pg_notify`s the Worker, which makes the actual RCON call.
- [x] An active kick vote should also be accessible from the servers live page.
- [x] Test: starting a vote while one is already active on that Server is rejected without a second broadcast call.
- [ ] Test: starting a vote against a Staff Member's steamId is rejected. **Dropped** along with the staff-exclusion requirement above (no such concept exists in this domain model).

## Comments

Implemented in commit bcbe7b0. See apps/web/src/lib/kick-vote.ts, apps/web/src/app/kick-vote-actions.ts, apps/web/src/app/kick-vote-panel.tsx, apps/worker/src/kick-vote-engine.ts, apps/worker/src/rcon-client.ts. Passed /code-review (standards + spec axes) with no hard violations.
