# 04: Staff can cancel an active KickVote

**What to build:** A `moderator` or `admin` can see the currently active KickVote(s) from the admin area and cancel one immediately, ending it as `staffCancelled` and recording the action in the staff audit log. See `packages/db/src/staff.ts`'s `cancel_kick_vote` STAFF_ACTIONS entry (already added) and the existing ban/unban admin-action pattern for the Role check and audit-log shape.

**Blocked by:** 01 (needs a KickVote to exist to cancel).

- [ ] The admin area lists every `active` KickVote (Server, target, reason, current Ballot count, time remaining).
- [ ] A `moderator` or `admin` can cancel any listed KickVote; any other Role cannot (matches the existing ban/unban Role gate).
- [ ] Cancelling sets `status: "staffCancelled"`, `resolvedAt`, and `cancelledByStaffMemberId` on the `kickVotes` row.
- [ ] Cancelling writes a `staffAuditLog` row with `action: "cancel_kick_vote"`, `target` set to the KickVote's id, and the acting Staff Member's attribution (matching the existing audit-log pattern from `docs/adr/0005`/ticket 08 of staff-auth).
- [ ] The `/kick/{id}` page reflects the cancellation live, same as the other terminal states in ticket 03.
- [ ] Test: a `moderator` (not just `admin`) can cancel.
- [ ] Test: cancelling an already-resolved KickVote is a no-op / clear error, not a silent overwrite of its terminal status.
