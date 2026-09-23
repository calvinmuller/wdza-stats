Status: ready-for-agent

# Kick Vote: crowd-driven vote-kick for disruptive players

## Problem Statement

There is no way for the community to remove a disruptive player (typically a suspected cheater) from a Server in real time. The only existing moderation tool, `bannedPlayers`, is app-side only (hides a steamId from stats/leaderboards) and requires a Staff Member to notice and act — there is no mechanism to kick someone from the live game at all, and none that a regular player can trigger themselves.

## Solution

Any site visitor can start a **KickVote** against a steamId currently online on a Server. It's announced once, in-game, via a real RCON broadcast with a shareable link. Other visitors open that link and cast a **KickVoteBallot** (one per browser session, no retraction, target excluded). If enough Ballots are cast within the configured window, the target is really kicked via RCON. See `CONTEXT.md` for the KickVote/KickVoteBallot glossary entries and `docs/adr/0006-kick-votes-get-a-narrow-rcon-write-exception.md` for why this is allowed to write to RCON at all (a narrow, explicit exception to ADR 0003's read-only stance).

## Domain Decisions (from grilling + domain-modeling sessions)

- **No player identity exists.** A voter is identified only by a per-browser-session token, not a real account — see ADR 0006's discussion of the resulting trust model (crowd threshold + unconditional staff-cancel, not authentication).
- **Target selection**: a dropdown/search over the Server's live `/v1/players` poll data — only currently-online steamIds are targetable. Staff/admin steamIds can never be targeted.
- **One active KickVote per Server** at a time, enforced at the DB level (`kick_votes_one_active_per_server_idx`).
- **Initiation** requires a short reason string (shown in the broadcast and on the page) and is rate-limited by a per-session cooldown.
- **Threshold, duration, and cooldown are DB-backed admin settings** (`kickVoteSettings`, singleton row, defaults: 25 Ballots / 300s / 600s), not env vars — matches the `xpRewards`/`notificationSettings` config-table pattern. Snapshotted onto the `KickVote` row at start so a mid-vote settings change never alters a vote in flight.
- **Broadcast fires once**, at start: `Kick vote started against {targetName} - reason: {reason} - vote now: wdza.gg/kick/{id}`. No further in-game broadcasts (success/failure/cancellation show only on the `/kick/{id}` page, live via the existing Postgres NOTIFY/SSE mechanism used for the kill feed).
- **Resolution is exactly one of four terminal states** (see `packages/db/src/kick-vote.ts`):
  - `succeeded` — threshold reached before the window closed → real RCON kick call.
  - `expired` — window closed first.
  - `targetLeft` — the target dropped out of the Server's live Snapshot before either of the above → auto-cancelled, nothing left to kick.
  - `staffCancelled` — a `moderator` or `admin` ended it early (new `cancel_kick_vote` STAFF_ACTIONS entry, audit-logged).
- **Shareable URL**: `wdza.gg/kick/{vote-id}` — a fresh id per vote (not a per-server stable slug), since a Server can have a new KickVote each time the last one resolves. The page derives its Server from the vote row.
- **RCON gains two write calls** it didn't have before (`POST /v1/players/{steamId}/kick`, `POST /v1/broadcast`) — see ADR 0006. Both endpoints already exist on the live RCON API; nothing else about RCON's read-only boundary changes.

## Already landed (prefactoring — schema, types, ADR)

- `packages/db/src/kick-vote.ts` — `KickVoteStatus` type.
- `packages/db/src/schema.ts` — `kickVoteSettings`, `kickVotes`, `kickVoteBallots` tables.
- `packages/db/src/staff.ts` — `cancel_kick_vote`, `update_kick_vote_settings` added to `STAFF_ACTIONS`.
- `packages/db/migrations/0026_kick_votes.sql` — creates the three tables, seeds default settings.
- `CONTEXT.md` — `KickVote`/`KickVoteBallot` glossary entries; `Notification`'s stale "never broadcast" caveat corrected.
- `docs/adr/0006-kick-votes-get-a-narrow-rcon-write-exception.md`.

## Tickets (see `issues/`)

1. Start a KickVote and announce it in-game.
2. Live `/kick/{id}` page where visitors cast Ballots.
3. Resolve a KickVote: success kicks the player; expiry and early target-departure end it without one.
4. Staff can cancel an active KickVote.
5. Staff can tune KickVote settings (threshold/duration/cooldown).
