# 05: Staff can tune KickVote settings

**What to build:** An `admin` can view and edit the KickVote threshold, duration, and initiator cooldown from the admin area, following the same pattern as the existing XP-reward settings UI (`apps/web/src/app/admin/xp/`). Changes only affect KickVotes started after the change (`.scratch/kick-vote/spec.md`'s snapshot-at-start rule, already implemented in the schema).

**Blocked by:** None (can start immediately — independent of the other tickets; `kickVoteSettings` and its seeded default row already exist).

- [ ] An admin-only page (e.g. under `apps/web/src/app/admin/kick-votes/`) shows the current `kickVoteSettings` singleton row: `thresholdBallots`, `durationSeconds`, `initiatorCooldownSeconds`.
- [ ] Only `admin` can edit these; `moderator` can view but not change (matches `update_xp_reward` being admin-only).
- [ ] Saving validates positive values (threshold ≥ 1, duration and cooldown ≥ 0) before writing.
- [ ] Saving writes a `staffAuditLog` row with `action: "update_kick_vote_settings"` and a `detail` payload showing the old/new values.
- [ ] Test: a `moderator` cannot save a change (Role check mirrors the XP-reward settings test).
