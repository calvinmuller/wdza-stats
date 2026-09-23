# Staff Members start KickVotes with their staff login

[ADR 0007](./0007-players-sign-in-with-steam-to-start-kick-votes.md) made signing in with Steam as a **Verified Player** the only way to start a KickVote, so a Staff Member who was already signed in to the staff area still had to sign in a second time, as a player, to start one. We decided that a signed-in Staff Member of either Role (moderator or admin) with a linked steamId may start a KickVote as that steamId, without a Verified Player session. The steamId is proven theirs the same way: linking only happens at the end of a Steam sign-in the Staff Member completed themselves. Every other initiator rule still applies to that steamId: online on that Server, not banned, the per-steamId cooldown, one active vote per Server, and never against themselves or another Staff Member's linked steamId.

Verified Players and Staff Members stay separate identities. The Staff Member doesn't become a Verified Player: the staff login only stands in for one when starting a KickVote. If both sessions are present, the Verified Player's steamId is the one used.

This first covered admins only; moderators were added soon after, because moderating players is what their Role is for.

## Considered Options

- Let Staff Members start a KickVote from the web without being online — rejected for now: the online check is what ties a KickVote to someone who witnessed the behaviour, and a Staff Member who wants a player gone without a vote can already ban them.

## Consequences

- Staff still see who started each KickVote as a steamId. For a KickVote a Staff Member started, that steamId is their linked one, so it points back to them.
- A Staff Member without a linked steamId is told to link one, not to sign in with Steam.
