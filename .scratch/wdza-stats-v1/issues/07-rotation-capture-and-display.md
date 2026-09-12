# 07: Rotation capture & display

**What to build:** Show visitors what map is coming up next, not just what's currently live.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] The Worker captures the Server's current rotation state (current and next rotation entries, including map name) alongside its regular Snapshot polling
- [ ] The live "server now" page (or, if built before this ticket lands, a small addition to it) shows the current and next map from the rotation
- [ ] Rotation data is read by the Web app only from Postgres, never by calling RCON directly
- [ ] Test seam: seeding Postgres with known rotation state and requesting the relevant page/route returns content showing the correct current/next map
