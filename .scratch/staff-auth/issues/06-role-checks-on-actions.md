# 06: Role checks on every server action

**What to build:** Every server action in the admin area re-checks the session and Role itself, since a server action is its own POST endpoint. Moderators may ban and unban players; everything else (config edits, feed tokens) is admin-only.

**Blocked by:** 05

**Status:** closed

- [x] `banPlayerAction` and `unbanPlayerAction` accept moderators and admins
- [x] The XP reward, level threshold, challenge, achievement, notification rule and settings actions, and `generateFeedTokenAction`, accept admins only
- [x] The `secret` parameter is removed from these actions and replaced by the session
- [x] A moderator only sees the ban and unban screens; admin-only sections are not rendered
- [x] Tests call each action directly as an anonymous caller, a moderator, and an admin, and assert the result

## Comments

Closed. The `secret` parameter had already gone from every action in ticket 05 (which made them all admin-only); this ticket opens ban and unban to moderators. `banPlayerAction` and `unbanPlayerAction` now call `requireStaffAction("moderator")` (admins pass too, since admin outranks moderator); the other seven, including `generateFeedTokenAction`, stay `requireStaffAction("admin")`.

`/admin` now requires only `moderator`. `page.tsx` is split into `ConfigSections`, `BannedPlayersSection` and `KillFeedSection`; a moderator gets just the banned-players section (and a "Moderation" intro line), and the config data is never queried for them. The sections are called as functions (`await ConfigSections()`) rather than rendered as async JSX children, so the page still resolves to plain elements that `renderToStaticMarkup` in `page.test.ts` can render.

`actions.test.ts` now carries each action's minimum Role and asserts: anonymous callers are refused by all nine; moderators are refused by the seven admin-only actions and pass the Role check on ban and unban; admins pass on everything except `generateFeedTokenAction`, which is not run as an admin (it would replace a real Server's token if one exists in the shared test DB). `page.test.ts` asserts a moderator sees "Banned players" but none of XP rewards, Level curve, Notification rules or Kill feed.
