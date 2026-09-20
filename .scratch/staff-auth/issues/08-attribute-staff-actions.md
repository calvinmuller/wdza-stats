# 08: Attribute staff actions to a Staff Member

**What to build:** Record which Staff Member performed each action: ban, unban, config edits, feed token generation, and Staff Member changes. The exact audit shape is up to implementation; at minimum record who banned or unbanned a player if the ban record has room for it, and don't build an audit log UI.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] A ban and an unban record the acting Staff Member
- [ ] The other listed actions record the actor, or the choice not to is written down in the comments with the reason
- [ ] Tests cover: a ban made by a moderator is attributed to that moderator
