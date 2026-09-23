Status: done

# 04: Staff Members link their steamId, which can never be targeted

**What to build:** A signed-in Staff Member can link their own steamId by completing Steam sign-in from the admin area. A linked steamId can never be the target of a KickVote. This finally enforces the kick-vote spec's "staff steamIds can never be targeted" rule.

**Blocked by:** 01 (reuses the Steam OpenID verification), 03 (target validation lives in the same start path).

- [x] Migration adds a nullable, unique `steam_id` to `staff_members`.
- [x] Linking is only possible by completing Steam sign-in while signed in as that Staff Member. There is no field where anyone types a steamId, including admins.
- [x] Linking does not create a Verified Player or a player session. The two identities stay separate.
- [x] A Staff Member can unlink their own steamId. Linking a steamId already linked to another Staff Member is refused.
- [x] Link and unlink are written to `staffAuditLog` (new `STAFF_ACTIONS` entries).
- [x] The live-server target picker hides staff-linked steamIds, and `startKickVote` refuses them server-side.
- [x] Tests: staff-linked steamId can't be targeted. The same steamId can't be linked to two Staff Members. Linking doesn't create a player session.

## Comments

Implemented in migration 0029 (nullable unique staff_members.steam_id), lib/staff-steam-link.ts (link/unlink/lookups, audited as link_own_steam_id / unlink_own_steam_id), routes app/api/steam/staff-link/{start,callback} (require a signed-in Staff Member and use the same Steam round trip, but never create a Verified Player or player session), and /admin/account, reached from a "Steam account" link beside "Change password" in the admin shell. startKickVote refuses a staff-linked target. getLiveSnapshot now carries the online staff-linked steamIds (staffSteamIds) so the picker hides them. Anyone watching the live API can therefore see which online players are staff, which the picker would reveal anyway.

While building this I found that the Steam round trip wasn't tied to the browser that started it. A captured, unused callback URL opened by a Staff Member would have linked the attacker's steamId to them. Fixed for both flows in lib/steam-sign-in-flow.ts with a state cookie that must match the state inside the return URL Steam signs (separate commit, also covers ticket 01's player sign-in).

In one full-suite run, "links the steamId to the acting Staff Member and records it" failed once. It passed alone and in three later full runs, and I didn't find the cause. Watch for it.
