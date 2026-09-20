# 08: Attribute staff actions to a Staff Member

**What to build:** Record which Staff Member performed each action: ban, unban, config edits, feed token generation, and Staff Member changes. The exact audit shape is up to implementation; at minimum record who banned or unbanned a player if the ban record has room for it, and don't build an audit log UI.

**Blocked by:** 06

**Status:** closed

- [x] A ban and an unban record the acting Staff Member
- [x] The other listed actions record the actor, or the choice not to is written down in the comments with the reason
- [x] Tests cover: a ban made by a moderator is attributed to that moderator

## Comments

Closed. A ban record has no room for who lifted it (unban deletes the row), so instead of a column on `banned_players` there is a small append-only `staff_audit_log` table (migration `0025`) and one helper, `recordStaffAction` in `lib/staff-audit.ts`. Every successful admin action writes one row: actor id and email, action name, target, and a small `detail` object. There is deliberately no UI, as the ticket said.

Recorded: `ban_player` (target steamId, detail reason), `unban_player`, the six config edits (target is the row key; detail is the submitted form fields, which hold no secrets), `generate_feed_token` (target is the Server id; the token is never recorded), the four staff-management actions, `change_own_password`, and the two bootstrap-page actions. The bootstrap page has no signed-in person, so its rows have a null `staff_member_id` and the actor `(bootstrap page)`. Nothing is written when an action is refused or fails, and no password or token ever goes into a row (a test asserts this for temporary passwords and bootstrap passwords).

The actor's id and email are copied in and are not a foreign key, so the trail survives a removed Staff Member (tested). Rows are written after the action succeeds, in a separate statement, so a crash between the two would lose an entry rather than block the action. Acceptable at this scale.

`generateFeedTokenAction`'s audit entry is not covered by a test: running it would replace a real Server's token if one exists in the shared test DB, the same reason it is skipped in `actions.test.ts`.
