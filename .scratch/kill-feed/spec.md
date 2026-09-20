Status: ready-for-agent

# Kill Feed: ingest, store, and show live

## Problem Statement

The Wardogs game can push a kill feed to a configured URL (`[WDServerFeed] Url` + `Token`), a direct report of who killed whom, unlike the Snapshot-inferred GameEvents. We store none of it. Warcon (`~/Sites/warcon`) already ingests this feed; its `src/routes/api/ingest/events/+server.ts`, `src/lib/server/feed-core.ts` and the `kills` table in `src/lib/server/db/schema.ts` are the reference, and `docs/wardogs-api.md` documents the payload.

## Solution

Accept the feed in `apps/web`, store each **Kill** (see `CONTEXT.md`), and show a live "X killed Y with an AK-74M" feed on the live page over SSE.

## Domain Decisions (from grilling session)

- **Scope is storage plus the live feed only.** Kills do NOT drive XP, Challenges or Achievements, and do not replace Snapshot-diff GameEvents. Making Kills the source for kill/death GameEvents is a separate, later change (needs its own grilling: idempotency and backfill). The schema must make that possible.
- **New term `Kill`**, distinct from `GameEvent`. Glossary updated.
- **Endpoint**: Next.js route handler `POST /api/ingest/events` in `apps/web`, writing straight to Postgres. No session or CSRF; the bearer token is the only credential. The game appends the path itself, so `Url` is the web origin.
- **Auth**: per-Server feed token. Only a SHA-256 hash is stored, in a new nullable `servers.feed_token_hash`. Provisioned by a "generate feed token" action in the `/[adminSecret]` area: shown once, regenerable.
- **Guards (copied from Warcon)**: 401 for an unknown token with a per-address throttle on bad tokens; per-Server cap of 1,200 posts/minute; 64 KB body limit; 200-event batch limit; 413 / 400 for oversize / malformed JSON.
- **Only `killed` events are stored.** Other types are counted as skipped and dropped.
- **Idempotency**: unique `(server_id, event_id)`; duplicates are counted, not errors.
- **Table `kills`**: `id bigserial` PK (monotonic SSE cursor), `server_id`, `event_id`, the game's instance id and `match_id` (its own namespace, per boot, NOT a Match), nullable `match_row` = the Match open on that Server at receipt, `event_time` (match clock, seconds), map, killer/victim steamId + name, nullable killer/victim Faction snapshotted at receipt, `cause`, `distance_m`, `headshot`, `suicide`, `tags` jsonb, received-at timestamp. No foreign keys on steamIds (matches existing convention). `teamKill` is NOT computed yet.
- **Retention**: keep forever, plain Postgres table, no TimescaleDB. Indexes on `(server_id, id)` and on killer/victim steamId. Revisit past a few million rows.
- **Live delivery is SSE**, one stream per Server: `GET /api/live-kills/stream?serverId=…`, public like the rest of the page. `:keepalive` comment every ~15 s. `id:` is the kill's row id; `Last-Event-ID` reconnects replay up to 50 rows, beyond that the client refetches. No polling fallback and no per-IP cap for now.
- **Fan-out is Postgres LISTEN/NOTIFY**: see `docs/adr/0004-fan-out-kills-to-live-streams-with-postgres-notify.md`.
- **Page load**: fetch the last 20 Kills for the Server over plain HTTP, then open the stream from that cursor. The feed is a rolling last 20 for the Server, not reset at Match boundaries.
- **Live page**: the kill feed is merged into the sidebar's "Recent activity" as one time-ordered list with All / Kills / Highlights filter chips (kills outnumber Notifications many times over on a busy Server). Kills from one batch share a timestamp, so ties are broken by row id, newest first.
- **Routes use the configured Server**, like `live-snapshot`, rather than taking `?serverId=`: the live page has no serverId to send.
- **Falling behind**: a reconnecting client more than 50 Kills behind gets `event: reset` (and the stream closes) instead of a partial replay; the client refetches the last 20 and reopens from its newest id.
- **Killerless deaths**: only a `Falling`-tagged one reads "fell"; any other reads "died".
- **Feed line rendering**: weapon kills show a display name (static `cause` → name map in `apps/web`, falling back to the prefix-stripped tag), a headshot marker, and distance only above 100 m. Suicide reads "X died"; a killerless death reads "Y fell"; RoadKill / VehicleExplosion read "with a vehicle". Names are the in-game names on the Kill row, linked to the player page by steamId when a page exists, plain text otherwise. Colour by Faction only where a Faction was snapshotted.
- **RCON stays read-only** (ADR 0003): this is an inbound push, not a write.

## Out of Scope

- Driving XP / Challenges / Achievements from Kills.
- Team-kill detection and moderation actions.
- Per-player kill history, weapon leaderboards.
- Storing non-`killed` event types.
- Configuring the game server: the owner sets `[WDServerFeed] Url` to the web origin and `Token` to the generated token.
