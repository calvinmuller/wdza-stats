# 15: Admin config area

**What to build:** A server/admin configuration area for editing XP rewards, the level curve, challenge definitions, achievement definitions, and notification settings (priority thresholds, per-minute cap) — all previously seeded as config rows in earlier tickets. No new authentication system: the admin screens sit behind an unguessable, env-configured secret URL path, consistent with the earlier decision not to build real auth for this pass.

**Blocked by:** 05: XP ledger + XP awards, 06: Levels + level-up events, 08: Achievement engine, 09: Daily challenges, 10: Notification recording + throttling

**Status:** ready-for-agent

- [ ] The admin area is reachable only via a secret URL path configured through an environment variable, not discoverable through normal site navigation
- [ ] XP reward values, the level curve, challenge definitions, achievement definitions, and notification priority/cooldown settings can all be viewed and edited through this area
- [ ] Editing a value takes effect for subsequent processing without requiring a redeploy
- [ ] No RCON credentials, password, or Authorization header are ever exposed through this area or its network requests
- [ ] Tests cover: editing at least one value in each config category and confirming it's picked up by the relevant engine afterward
