# Gamification notifications don't write to RCON

The existing RCON integration is deliberately read-only — `rcon-client.ts` only ever calls `GET /v1/status` and `GET /v1/players`. Its comment pointing at a `spec.md` for the rationale had us worried the reasoning was lost, since no such file exists at the repo root; it turned out to survive at `.scratch/wdza-stats-v1/spec.md`, whose Out of Scope section says plainly: "Any admin/moderation feature: kick, kill, message, ban, broadcast, map/rotation control, config editing. All deferred to a future phase behind real authentication." The gamification engine's notification layer (match started, achievement unlocked, kill streaks, etc.) could justify the first-ever write call (`POST /v1/broadcast`) to announce these events in-game. We decided not to, consistent with that original deferral: no real authentication exists yet (see the admin-access decision in this same build), the RCON credential is full-access, and we don't even know whether the live Wardogs RCON API exposes a broadcast endpoint at all. Notifications are recorded (for the dashboard's recent-events feed) but never delivered to the game server.

## Considered Options
- Add the write call now, assuming a broadcast endpoint exists on the real RCON API — rejected: breaks a deliberate invariant on unconfirmed API support.
- Deliver via a Discord webhook instead of RCON — a good fast-follow, but out of scope for this pass; keeps the read-only boundary intact either way.
- Keep RCON read-only, record notifications only, for now (chosen).

## Consequences
- The in-game broadcast copy (🏁 MATCH STARTED, etc.) exists as configured message templates with no delivery channel yet — ready to wire up once a channel (Discord, or a confirmed RCON write endpoint) is chosen.
- If RCON ever needs a write call for some other reason, this same "should we break read-only" question should be asked again explicitly rather than assumed answered by precedent.
