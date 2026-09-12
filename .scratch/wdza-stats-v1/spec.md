Status: ready-for-agent

# WDZA Stats v1: RCON Ingestion + Public Stats Site

## Problem Statement

The WDZA Wardogs community server exposes a live RCON API, but that API only ever reports the current instant — who's online right now, the current match's running scores. It has no memory of anything that happened before the last poll: no match history, no per-player career totals, no leaderboards. Players and admins have no way to see who's actually good, who's been grinding, or how the server's history has unfolded over time — the moment a match ends, everything about it is gone.

## Solution

Stand up a small always-on system that continuously polls the RCON API, turns that live stream into durable historical facts (closed Matches and per-player stats), and serves them through a public, read-only stats website: a "server now" live view plus all-time leaderboards. No login required to view. No moderation/admin actions in this phase — this is a stats mirror, not a control panel.

## User Stories

1. As a visitor, I want to see the server's current map and lighting, so that I know what's happening on the server right now without joining it.
2. As a visitor, I want to see each Faction's current running score for the in-progress Match, so that I can tell who's winning right now.
3. As a visitor, I want to see the list of players currently online, so that I can check if my friends are playing.
4. As a visitor, I want to see each online player's current kills, deaths, and cash for the in-progress Match, so that I can gauge who's dominating the current round.
5. As a visitor, I want the live view to refresh automatically without me reloading the page, so that the numbers stay current while I watch.
6. As a visitor, I want to see an all-time leaderboard ranked by kills, so that I can see who has the most kills on this server ever.
7. As a visitor, I want to see an all-time leaderboard ranked by deaths, so that I can see who has died the most.
8. As a visitor, I want to see an all-time leaderboard ranked by K/D ratio, so that I can see who plays most efficiently.
9. As a visitor, I want to see an all-time leaderboard ranked by cash earned, so that I can see who has accumulated the most in-game wealth.
10. As a visitor, I want to see aggregate performance broken down by Faction, so that I can see which Faction tends to perform best on this server.
11. As a visitor, I want to look up a specific player (by name or profile link) and see their all-time totals, so that I can check my own or a friend's career stats.
12. As a visitor, I want to see the server's map rotation (current and upcoming entries), so that I know what map is coming up next.
13. As a visitor, I want the site to clearly show which Faction/team a player belongs to (with the Faction's color), so that stats are easy to scan visually.
14. As a visitor, I want to view the site on my phone, so that I can check stats without being at a desktop.
15. As a visitor, I want the site to load and be usable without creating an account or logging in, so that checking stats has zero friction.
16. As a visitor, I want the site to never expose the RCON admin password anywhere in the page source, network requests, or client code, so that the server's security isn't put at risk by a stats site.
17. As the operator, I want a background worker to poll the RCON API on a fixed cadence (15 seconds) per Server, so that we build a continuous historical record without spamming the RCON endpoint.
18. As the operator, I want the system to detect when one Match has ended and a new one has begun purely from the pattern of polled Snapshots (map change, rotation position change, or a player's counters dropping below their previous value), so that we get accurate match history even though the RCON API sends no explicit match-end event.
19. As the operator, I want each closed Match to produce a PlayerMatchStat row per player who was observed during it, computed as the delta between their first- and last-observed counter values in that Match, so that per-match contributions are captured accurately even for players who join or leave partway through.
20. As the operator, I want a player who switches Faction mid-Match to be attributed to whichever Faction they were on at their last observed Snapshot in that Match, so that we don't have to model split-faction stats for a rare edge case.
21. As the operator, I want each closed Match's PlayerMatchStat deltas rolled into that player's PlayerCareerStat for that Server, so that leaderboards can be served from a fast, pre-aggregated total rather than summing every historical Match on every page view.
22. As the operator, I want PlayerCareerStat to be scoped per-Server (keyed by steamId + serverId), so that stats from different Wardogs servers with different rules/communities are never blended into one misleading number.
23. As the operator, I want the data model keyed by serverId throughout (Server, Match, PlayerMatchStat, PlayerCareerStat), even though only one Server exists today, so that a second server can be onboarded later without a schema migration.
24. As the operator, I want the worker to keep functioning correctly if it misses a stretch of polls (deploy, restart, network blip) and comes back to a completely different game state, so that a gap in coverage doesn't corrupt or silently merge unrelated Matches.
25. As the operator, I want the RCON bearer token to live only in the worker's server-side environment configuration (Railway env vars), never in any code committed to the repo and never sent to a browser, so that the full-access admin credential can't leak.
26. As the operator, I want the web app to read stats only from our own Postgres database, never calling the RCON API directly from a page or browser-facing route, so that the RCON token's exposure surface is limited to one process.
27. As the operator, I want bans, the audit log, and reserved-slots data to never be fetched or stored by this system at all, so that moderation-facing data can't accidentally leak onto a public page.
28. As the operator, I want the web app and the ingestion worker deployed as two separate Railway services sharing one Postgres addon, so that a slow/blocked web request can never stall ingestion and vice versa.
29. As a future maintainer, I want the domain terms used in code (Server, Snapshot, Match, Faction, PlayerMatchStat, PlayerCareerStat) to match `CONTEXT.md` exactly, so that the codebase and the glossary never drift apart.
30. As a future maintainer, I want to be able to add Steam Web API name/avatar enrichment later without reworking the schema, so that player identity (steamId as primary key, display name as a mutable denormalized field) doesn't need to change shape.
31. As a future maintainer, I want to be able to add an admin/moderation panel later without reworking the stats schema, so that the read-only v1 doesn't box in the write-capable v2.

## Implementation Decisions

- **Two deployables on Railway**: an ingestion **Worker** (long-running Node/TypeScript process) and a **Web** app (Next.js/TypeScript), sharing one Postgres database (Railway Postgres add-on). No serverless/edge functions for ingestion — it needs a persistent polling loop.
- **RCON client module**: a thin typed wrapper around `GET /v1/status` and `GET /v1/players` for one Server (base URL + bearer token in, parsed Snapshot payload out). Only used by the Worker; the Web app never imports it or holds a token.
- **Polling cadence**: one poll of both endpoints per Server every 15 seconds, per the ADR-backed decision that the RCON docs' own "poll gently, few seconds at most" guidance and the official panel's 3-5s cadence both permit this comfortably within the documented 600 req/min limit.
- **Match-boundary detection** (see `docs/adr/0001-infer-match-boundaries-from-snapshot-deltas.md`): comparing each new Snapshot to the previous one for the same Server, a new Match begins when `map` changes, `rotation.nowIndex` changes, or any player's `kills`/`deaths`/`cash` value is lower than that same player's value in the prior Snapshot. `lighting` and `alternator` changes are explicitly **not** boundary signals — they can change within a single ongoing Match.
- **PlayerMatchStat computation**: on Match close, for every steamId observed in at least one Snapshot during that Match's window, take `delta = (value at that player's last Snapshot in the Match) - (value at that player's first Snapshot in the Match)` for kills, deaths, and cash independently. Faction attributed = the Faction observed at that player's last Snapshot in the Match.
- **Snapshot retention**: raw Snapshots are retained only for the duration of the currently-open Match (needed to compute that Match's deltas on close) and are not kept indefinitely once a Match closes and its PlayerMatchStat rows are persisted — only Match-level and player-stat rows are permanent history.
- **PlayerCareerStat maintenance**: updated incrementally (upsert-add) the moment each Match closes, keyed by `(serverId, steamId)`. This is a derived rollup; PlayerMatchStat rows remain the source of truth and career totals could in principle be rebuilt from them.
- **Downtime/gap handling**: if the Worker resumes polling after a gap and observes state inconsistent with a clean continuation (different map/rotation, or reset counters), it closes any still-open Match using the last-known-good Snapshot and opens a new Match from the first post-gap Snapshot — the same logic as a normal boundary, no special-cased "gap" entity needed.
- **Schema shape**: `Server(id, name, baseUrl)`, `Match(id, serverId, map, experiences, startedAt, endedAt)`, `PlayerMatchStat(matchId, steamId, faction, kills, deaths, cash)`, `PlayerCareerStat(serverId, steamId, displayName, kills, deaths, cash, matchesPlayed)`. `displayName` on PlayerCareerStat is denormalized from the most recent Snapshot observation and is expected to change over time.
- **Live "server now" view**: served by the Web app reading the most recent Snapshot/open-Match state for the configured Server directly from Postgres (written by the Worker) — the Web app never queries RCON itself. The page refreshes client-side no faster than the Worker's own 15s ingestion cadence.
- **Leaderboards**: server-rendered from `PlayerCareerStat`, sortable by kills / deaths / K:D / cash, scoped to the one configured Server, all-time (no seasons/resets in this phase).
- **No RCON write endpoints are called anywhere in this system** — not kick, kill, message, ban, broadcast, config, rotation edits, nor map/lighting control. Only the two read endpoints (`/v1/status`, `/v1/players`) are ever hit.
- **Bans / audit log / reserved-slots are out of scope for data access entirely** — no code path in Worker or Web calls those endpoints.
- **Secrets**: the RCON bearer token is stored only as a Railway environment variable on the Worker service. It must be rotated to a fresh value before go-live, since the current token was shared in plaintext during discovery/design and should be treated as compromised for production use.
- **No authentication anywhere in v1** — the entire Web app is public, unauthenticated, read-only.

## Testing Decisions

Tests assert only on externally observable behavior — database rows for the Worker, HTTP response content for the Web app — never on internal function calls or private module structure, since this is a brand-new codebase with no established test patterns yet to follow as prior art; this spec's test suite sets that precedent for the repo.

- **Worker seam**: replace the RCON client with a fake that serves a scripted sequence of raw `/v1/status` + `/v1/players` payloads (including at least: a normal in-progress match, a mid-match Faction switch by one player, a same-map restart via counter reset, a map/rotation change, and a simulated polling gap), run the real ingestion pipeline against a real test Postgres database, and assert on the resulting `Match`, `PlayerMatchStat`, and `PlayerCareerStat` rows.
- **Web seam**: seed the test Postgres database directly with known `Match`/`PlayerCareerStat` rows (bypassing the Worker), then issue real HTTP requests against the Web app's routes/pages and assert on the rendered/served content (leaderboard ordering and values, live-view figures).
- Both seams use a real database (no ORM/query mocking) so that schema and query correctness are actually exercised, not assumed.

## Out of Scope

- Any admin/moderation feature: kick, kill, message, ban, broadcast, map/rotation control, config editing. All deferred to a future phase behind real authentication.
- Steam Web API integration for resolving avatars or canonical Steam profile names — v1 uses the raw in-game display name as returned by RCON.
- Multi-server UI (a server picker/switcher) — the schema is multi-server-ready, but v1 only configures and displays the one WDZA server.
- Any login/authentication/accounts anywhere on the site.
- Leaderboard seasons or periodic resets — all-time totals only.
- Custom domain — ships on Railway's provided subdomain.
- Any display of bans, audit log, or reserved-slots data, anywhere on the public site.

## Further Notes

- This spec depends on `docs/adr/0001-infer-match-boundaries-from-snapshot-deltas.md`, which documents that the live server does not actually send the `matchSeconds`/`scoreCap` fields the RCON docs describe — confirmed by direct inspection of the raw response during design. All Match-boundary logic must not assume those fields exist.
- The core assumption that per-player kill/death/cash counters reset (or at least go non-monotonic) at a real Match boundary has not yet been observed end-to-end against the live server — only accumulation within a single long-running Match was observed during design. The Worker's test suite encodes our best-guess model of a reset; this should be watched closely against real production data shortly after go-live, and the detection logic revisited if real server behavior differs.
- The RCON bearer token used throughout design/discovery against `165.217.136.112:9006` must be rotated before this ships to production, since it has been handled in plaintext in chat/design artifacts. The old token's value is deliberately not recorded anywhere in this repo.
- Domain vocabulary throughout this spec and its implementation must match `CONTEXT.md` (Server, Snapshot, Match, Faction, PlayerMatchStat, PlayerCareerStat) exactly.
