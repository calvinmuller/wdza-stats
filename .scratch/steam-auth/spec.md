Status: done

# Steam Auth: Verified Players start KickVotes

## Problem Statement

Anyone with a browser can start a **KickVote**, and the per-session start cooldown is defeated by clearing cookies or opening another browser. Nobody accountable stands behind a vote. Separately, the kick-vote spec promises that Staff Members' steamIds can never be targeted, but nothing enforces it: Staff Members have no steamId. Players also have no way to prove a stats page is theirs.

## Solution

A person signs in with Steam and becomes a **Verified Player** who owns that steamId. Signing in the first time *is* the claim. Only a Verified Player who is online on a Server and not banned can start a KickVote there. Ballots stay anonymous, one per browser session. A Staff Member can link their own steamId by completing the same Steam sign-in, which protects that steamId from being targeted. See `CONTEXT.md` (Verified Player, KickVote, KickVoteBallot, Staff Member) and `docs/adr/0007-players-sign-in-with-steam-to-start-kick-votes.md`.

## Domain Decisions (from grilling + domain-modeling session)

- **Claim = first Steam sign-in.** No separate claim or approval step. A steamId never seen in any Snapshot can still be claimed.
- **Hand-rolled Steam OpenID 2.0**: redirect to Steam, then confirm the assertion with Steam (`check_authentication`) before trusting the returned steamId. Own Verified Player table, own session table, own cookie. Not part of the staff Better Auth instance (`apps/web/src/lib/auth.ts`), and unrelated to the anonymous visitor session (`lib/visitor-session.ts`), which stays for Ballots.
- **Sessions last 30 days.** Players can sign out. Staff can't revoke player sessions in v1.
- **Return-to after sign-in**: sign-in sends the player back to where they started (e.g. the live-server kick panel), accepting only same-origin relative paths so the link can't redirect anywhere else.
- **Banned steamIds can sign in** but can't start a KickVote.
- **First claim fetches the SteamProfile** immediately. After that, the normal refresh when a Match closes applies.
- **Starting a KickVote** requires a Verified Player who is present in that Server's live Snapshot, is not a BannedPlayer, and isn't targeting their own steamId or a Staff Member's linked steamId. The online check applies at start only: the vote continues if the initiator leaves.
- **Start cooldown keyed by initiator steamId**, not session. It uses the same `kickVoteSettings.initiatorCooldownSeconds`.
- **Initiator visibility**: a KickVote records its initiator's steamId. Only Staff Members see it (admin area). The broadcast and `/kick/{id}` page don't show it.
- **Staff Steam link**: a signed-in Staff Member links a steamId only by completing Steam sign-in. At most one Staff Member per steamId. Linking does not create a Verified Player; the two stay separate identities.
- **Profile ownership (v1)**: a "verified" badge on `/players/[steamId]` and a header "this is you" link to the signed-in player's page. Out of scope: cosmetics, privacy/opt-out, private "me" views, badges on leaderboards/kill feed.
- **Ballots are unchanged**: anonymous, one per browser session, no sign-in.

## Tickets (see `issues/`)

1. Players sign in with Steam and become Verified Players.
2. Player pages show a verified badge.
3. Only an online Verified Player can start a KickVote.
4. Staff Members link their steamId, which can never be targeted.
5. Staff see who started a KickVote.
