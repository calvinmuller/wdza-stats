Status: done

# 05: Staff can tune KickVote settings

**What to build:** An `admin` can view and edit the KickVote threshold, duration, and initiator cooldown from the admin area, following the same pattern as the existing XP-reward settings UI (`apps/web/src/app/admin/xp/`). Changes only affect KickVotes started after the change (`.scratch/kick-vote/spec.md`'s snapshot-at-start rule, already implemented in the schema).

**Blocked by:** None (can start immediately — independent of the other tickets; `kickVoteSettings` and its seeded default row already exist).

- [x] An admin-only page (e.g. under `apps/web/src/app/admin/kick-votes/`) shows the current `kickVoteSettings` singleton row: `thresholdBallots`, `durationSeconds`, `initiatorCooldownSeconds`.
- [x] Only `admin` can edit these; `moderator` can view but not change (matches `update_xp_reward` being admin-only).
- [x] Saving validates positive values (threshold ≥ 1, duration and cooldown ≥ 0) before writing.
- [x] Saving writes a `staffAuditLog` row with `action: "update_kick_vote_settings"` and a `detail` payload showing the old/new values.
- [x] Test: a `moderator` cannot save a change (Role check mirrors the XP-reward settings test).

## Comments

Implemented in apps/web/src/lib/admin-config.ts (getKickVoteSettings, updateKickVoteSettingsFromForm) and apps/web/src/app/admin/actions.ts (updateKickVoteSettingsAction, admin-only), on the same /admin/kick-votes page as ticket 04. Moderators see the inputs disabled with no Save button. The audit detail is `{ old, new }` rather than the raw form fields other settings actions record. Validation follows the ticket exactly: duration 0 is accepted, which makes new KickVotes expire immediately. Passed /code-review (standards + spec).
