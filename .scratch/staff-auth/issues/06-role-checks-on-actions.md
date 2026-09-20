# 06: Role checks on every server action

**What to build:** Every server action in the admin area re-checks the session and Role itself, since a server action is its own POST endpoint. Moderators may ban and unban players; everything else (config edits, feed tokens) is admin-only.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] `banPlayerAction` and `unbanPlayerAction` accept moderators and admins
- [ ] The XP reward, level threshold, challenge, achievement, notification rule and settings actions, and `generateFeedTokenAction`, accept admins only
- [ ] The `secret` parameter is removed from these actions and replaced by the session
- [ ] A moderator only sees the ban and unban screens; admin-only sections are not rendered
- [ ] Tests call each action directly as an anonymous caller, a moderator, and an admin, and assert the result
