Status: done

# 02: Player pages show a verified badge

**What to build:** `/players/[steamId]` shows a "verified" badge when that steamId has been claimed by a Verified Player. Badge only, with no other profile controls (see `spec.md`'s out-of-scope list).

**Blocked by:** 01.

- [x] Badge appears on `/players/[steamId]` for a claimed steamId, on every Server's view of that player (claiming is per steamId, not per Server).
- [x] No badge for an unclaimed steamId, and no change to leaderboards or the kill feed.
- [x] Test: claimed vs unclaimed steamId render correctly.

## Comments

Implemented with isVerifiedPlayer (lib/verified-player.ts) and a "Verified" pill beside the avatar on /players/[steamId]. That page only ever shows the configured Server, so the badge is the same on every Server view by construction.
