Status: ready-for-agent

# 03: Only an online Verified Player can start a KickVote

**What to build:** Starting a KickVote now requires a signed-in Verified Player who is present in that Server's live Snapshot and isn't banned. The initiator is recorded by steamId and the start cooldown is keyed by steamId. Casting a Ballot is unchanged and still anonymous. Update `apps/web/src/app/kick-vote-actions.ts` / `startKickVote` and the live-server kick panel.

**Blocked by:** 01.

- [ ] Migration adds `initiator_steam_id` to `kick_votes` (with an index on it plus `started_at` for the cooldown check). Historical rows keep their `initiator_session_id` and a null steamId. New rows require the steamId. Drop the session-keyed cooldown index once nothing reads it.
- [ ] Signed-out visitors see "Sign in with Steam to start a kick vote" in place of the start form. Sign-in returns them to the same page (ticket 01's return-to).
- [ ] Refused, with a clear reason, when the initiator: isn't in the Server's current live Snapshot, is a BannedPlayer, is the target, or is within `initiatorCooldownSeconds` of their last started KickVote on any Server.
- [ ] Refusal is re-checked server-side in the action, not just hidden in the UI.
- [ ] The vote continues if the initiator leaves the Server after starting it.
- [ ] Broadcast text and `/kick/{id}` page do not show the initiator.
- [ ] Ballots: no sign-in required, still one per browser session (unchanged).
- [ ] Update the "Any site visitor may call this" comment in `kick-vote-actions.ts` to match the new rule.
- [ ] Tests: signed-out refusal, offline initiator refusal, banned initiator refusal, self-target refusal, and a cooldown that survives a new browser session for the same steamId.
