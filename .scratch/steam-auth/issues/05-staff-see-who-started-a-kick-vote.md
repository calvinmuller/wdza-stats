Status: done

# 05: Staff see who started a KickVote

**What to build:** The admin KickVotes page (`apps/web/src/app/admin/kick-votes/`) shows each vote's initiator (persona name/steamId linking to their player page). Visible to `moderator` and `admin` only. Never shown publicly.

**Blocked by:** 03.

- [x] Active KickVotes list shows the initiator. Historical session-only votes show "anonymous (before Steam sign-in)".
- [x] Initiator is not exposed on `/kick/{id}`, the SSE payload, or any public API response.
- [x] Test: a public `/kick/{id}` render and its live payload don't contain the initiator steamId.

## Comments

listActiveKickVotes now returns initiatorSteamId plus the cached SteamProfile persona name. The admin Kick Votes page shows "Started by <name>", linking to their player page, or "anonymous (before Steam sign-in)" for older session-started votes. Nothing public carries the initiator. getKickVote selects only public columns (ticket 03), the stream payload is status/ballotCount/threshold only, and a new /kick/{id} page test asserts the initiator steamId isn't in the render.
