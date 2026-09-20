# Fan out Kills to live streams with Postgres LISTEN/NOTIFY

The live page shows the kill feed over SSE. The game POSTs Kills to whichever web process the request lands on, while viewers hold streams open on any process, so an in-process emitter would silently drop kills the moment Railway runs a second web replica. After storing a batch, ingest issues `NOTIFY` with only the serverId; each web process keeps one dedicated `LISTEN` connection, reads the new rows past its cursor, and writes them to its open streams. Stream ids are the kills' monotonic row id, so `Last-Event-ID` reconnects replay from the database.

## Considered Options
- In-process event emitter — rejected: correct only for a single web process, and the failure is silent.
- A separate broker (Redis pub/sub) — rejected: a new service for one feed; Postgres is already the shared dependency.
- Polling a `since` cursor — rejected by the owner in favour of SSE for a genuinely live feed.

## Consequences
- Each web process holds one extra long-lived database connection.
- Notify carries only the serverId, so Postgres's 8 KB payload limit never matters.
