Status: ready-for-agent

# 04: Staff Members link their steamId, which can never be targeted

**What to build:** A signed-in Staff Member can link their own steamId by completing Steam sign-in from the admin area. A linked steamId can never be the target of a KickVote. This finally enforces the kick-vote spec's "staff steamIds can never be targeted" rule.

**Blocked by:** 01 (reuses the Steam OpenID verification), 03 (target validation lives in the same start path).

- [ ] Migration adds a nullable, unique `steam_id` to `staff_members`.
- [ ] Linking is only possible by completing Steam sign-in while signed in as that Staff Member. There is no field where anyone types a steamId, including admins.
- [ ] Linking does not create a Verified Player or a player session. The two identities stay separate.
- [ ] A Staff Member can unlink their own steamId. Linking a steamId already linked to another Staff Member is refused.
- [ ] Link and unlink are written to `staffAuditLog` (new `STAFF_ACTIONS` entries).
- [ ] The live-server target picker hides staff-linked steamIds, and `startKickVote` refuses them server-side.
- [ ] Tests: staff-linked steamId can't be targeted. The same steamId can't be linked to two Staff Members. Linking doesn't create a player session.
