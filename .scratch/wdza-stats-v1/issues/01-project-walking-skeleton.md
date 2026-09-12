# 01: Project walking skeleton

**What to build:** The foundational scaffold that every other ticket builds on: a Worker service and a Web service, each deployable to Railway, sharing one Postgres database that already has the full domain schema migrated. No feature behavior yet — this ticket proves the deployment and data path work end-to-end before any domain logic is written.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Repo contains two independently runnable services: a Worker (long-running Node/TypeScript process) and a Web app (Next.js/TypeScript)
- [ ] A migration creates the full schema per `CONTEXT.md`: `Server(id, name, baseUrl)`, `Match(id, serverId, map, experiences, startedAt, endedAt)`, `PlayerMatchStat(matchId, steamId, faction, kills, deaths, cash)`, `PlayerCareerStat(serverId, steamId, displayName, kills, deaths, cash, matchesPlayed)`
- [ ] One `Server` row exists for the configured WDZA server (base URL + RCON token read from environment variables, never hardcoded)
- [ ] Both services deploy to Railway and connect successfully to a shared Postgres add-on
- [ ] Web app exposes a health-check route that confirms it can query Postgres
- [ ] Worker logs a heartbeat confirming it can connect to Postgres on startup
- [ ] No RCON bearer token or other secret appears anywhere in committed code or config — only in environment variables
