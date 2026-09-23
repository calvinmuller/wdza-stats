# Players sign in with Steam to start KickVotes

[ADR 0005](./0005-staff-login-replaces-the-secret-admin-url.md) deferred Steam login for players because nothing player-facing needed it. KickVote now does: an anonymous browser session could start a vote, and the per-session cooldown was defeated by clearing cookies. We decided that a person proves they own a steamId by signing in with Steam (becoming a **Verified Player**), and that only a Verified Player who is online on that Server and not banned can start a KickVote. Casting a KickVoteBallot deliberately stays anonymous and per browser session, so the crowd threshold is still the safeguard ADR 0006 describes. What changes is that every KickVote now has an accountable initiator, visible to Staff Members only, and the start cooldown is keyed by steamId.

Steam sign-in is a small, hand-rolled Steam OpenID 2.0 check (redirect, then confirm the assertion with Steam) with its own Verified Player and session tables and its own cookie. It is not part of the staff Better Auth instance. Verified Players and Staff Members stay separate identities even when the same human is both. A Staff Member can link a steamId only by completing that same Steam sign-in while signed in as staff, and a linked steamId can never be the target of a KickVote.

## Considered Options

- Require sign-in for Ballots too, one per steamId — rejected for now: it would make the threshold mean "N people", but it adds friction to the one action that needs a crowd to act fast. Revisit if session-stuffed Ballots show up in practice.
- A second Better Auth instance with a custom Steam plugin — rejected: two auth instances plus a plugin to maintain, for a flow about 100 lines long. Better Auth's generic OAuth support doesn't apply because Steam speaks OpenID 2.0, not OAuth2.
- Adding Steam to the staff Better Auth instance, so players and staff are one "user" — rejected: it would reopen every decision in ADR 0005 and create the general "account" concept the glossary deliberately avoids.
- Letting an admin type in a Staff Member's steamId — rejected: any admin login could then shield an arbitrary steamId from KickVotes.

## Consequences

- The initiator side of ADR 0006's "no per-voter authentication" trade-off no longer holds. The ballot side still does.
- Signing in proves steamId ownership, not good faith: one Steam account can still start a vote every cooldown period. If that becomes the abuse pattern, the fix is a steamId-level block on starting votes, not a different sign-in.
