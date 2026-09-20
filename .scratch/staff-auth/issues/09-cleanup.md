# 09: Cleanup and docs

**What to build:** Remove the leftover secret checks and update everything that mentions the old admin gate.

**Blocked by:** 05, 06, 07

**Status:** ready-for-agent

- [ ] No admin server action or page checks `ADMIN_PATH_SECRET` any longer; only the bootstrap page does
- [ ] `.env.example` and the README describe the bootstrap-only use of `ADMIN_PATH_SECRET`
- [ ] The comment on `.scratch/wardogs-gamification-engine/issues/15-admin-config-area.md` gets a pointer to this feature
- [ ] The full test suite and typecheck pass
