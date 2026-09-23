Status: ready-for-agent

# 05: Staff see who started a KickVote

**What to build:** The admin KickVotes page (`apps/web/src/app/admin/kick-votes/`) shows each vote's initiator (persona name/steamId linking to their player page). Visible to `moderator` and `admin` only. Never shown publicly.

**Blocked by:** 03.

- [ ] Active KickVotes list shows the initiator. Historical session-only votes show "anonymous (before Steam sign-in)".
- [ ] Initiator is not exposed on `/kick/{id}`, the SSE payload, or any public API response.
- [ ] Test: a public `/kick/{id}` render and its live payload don't contain the initiator steamId.
