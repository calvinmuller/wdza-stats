# Staff Members start KickVotes with their staff login

[ADR 0007](./0007-players-sign-in-with-steam-to-start-kick-votes.md) made signing in with Steam as a **Verified Player** the only way to start a KickVote, so a Staff Member who was already signed in to the staff area still had to sign in a second time, as a player, to start one. We decided that a signed-in Staff Member of either Role (moderator or admin) with a linked steamId may start a KickVote as that steamId, without a Verified Player session. The steamId is proven theirs the same way: linking only happens at the end of a Steam sign-in the Staff Member completed themselves. Unlike a Verified Player, a Staff Member needn't be online on that Server: they often moderate from the website rather than from inside the game. Every other initiator rule still applies to that steamId: not banned, the per-steamId cooldown, one active vote per Server, and never against themselves or another Staff Member's linked steamId.

Verified Players and Staff Members stay separate identities. The Staff Member doesn't become a Verified Player: the staff login only stands in for one when starting a KickVote. If both sessions are present, the Staff Member's linked steamId is the one used, so the online exemption applies.

This first covered admins only, and still required them to be online. Moderators were added soon after, because moderating players is what their Role is for. The online requirement was dropped for Staff Members when an admin who wasn't in the game couldn't start a vote from the site.

## Considered Options

- Keep the online requirement for Staff Members too — rejected: it ties a KickVote to someone who saw the behaviour first-hand, but Staff Members are trusted to moderate from outside the game already (they can ban without being online), and requiring them to join first made the feature unusable from the site.

## Consequences

- Staff still see who started each KickVote as a steamId. For a KickVote a Staff Member started, that steamId is their linked one, so it points back to them.
- A Staff Member without a linked steamId is told to link one, not to sign in with Steam.
