# 14: Server overview dashboard extensions

**What to build:** Add active daily challenges and a recent-events feed to the existing live "server now" dashboard view, alongside its current Match/players/map/faction-score display. The recent-events feed reads from the Notification records introduced in ticket 10 (already throttled/curated), not the raw GameEvent log, so it doesn't flood the page with every kill.

**Blocked by:** 09: Daily challenges, 10: Notification recording + throttling

**Status:** ready-for-agent

- [ ] The server overview page shows the currently active daily challenges and their progress (if the current Server has an authenticated viewer's per-player progress available; otherwise the challenge definitions and overall status)
- [ ] The server overview page shows a recent-events feed sourced from `Notification` records, most recent first
- [ ] Existing live view behavior (current Match, players, map, faction scores) is unchanged
- [ ] Tests cover: the new sections rendering correctly alongside the existing live view content
