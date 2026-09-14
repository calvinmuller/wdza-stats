# 02: Worker Steam Web API client + on-sighting refresh

**What to build:** The first time the worker sees a steamId in a live RCON roster with no cached `steamProfiles` row, it fetches that player's Steam persona name, avatar, and WARDOGS achievement unlocks and persists them — within one ~15s poll cycle of them joining, not gated by Match boundaries. (Revised from the original Match-close trigger: that left a player with no avatar for the entire duration of a Match, sometimes minutes, even though their name already appears within one poll. See conversation — the fetch is now decoupled from `closeMatch` entirely.) The WARDOGS achievement schema (name/description/icon per achievement) is fetched once and cached, not per player. A `"private"` result is terminal and never retried; an `"error"` result (network blip, 429) is retried on the player's next sighting rather than cached as permanent.

**Blocked by:** 01 (SteamProfile schema).

**Status:** done

- [x] `apps/worker/src/steam-client.ts` (mirrors the shape of `rcon-client.ts`): wraps three ISteamUser/ISteamUserStats calls behind a `SteamClient` interface —
  - `fetchPlayerSummaries(steamIds: string[])` → batches up to 100 steamIds per `GetPlayerSummaries` call
  - `fetchPlayerAchievements(steamId: string, appId: number)` → `GetPlayerAchievements`; a `success: false` response (private profile) must be treated as a normal, non-throwing result, not an error
  - `fetchGameSchema(appId: number)` → `GetSchemaForGame`, parsed into `{apiName, displayName, description, iconUrl}[]`
  - Steam's per-second burst limit is undocumented but community-observed at ~25 req/s with a hard lock (tightened from ~100 req/s in June 2025) — a 429 must be read as retryable (respect `Retry-After` if present, otherwise back off), not a permanent failure
- [x] `apps/worker/src/steam-profile-refresh.ts`: exports `refreshUnseenSteamProfiles(db, steamIds: string[])` — filters `steamIds` down to those with no `steamProfiles` row (or an `"error"` row from a prior attempt), fetches only those via a batched summaries call + per-player achievements call, and upserts `"ok"` / `"private"` / `"error"` rows. Never throws — one player's failure must not block the others or the caller.
  - Sequence/stagger the per-player achievement calls rather than firing them all via `Promise.all` — relevant when a worker restart makes a whole online roster look "unseen" at once.
- [x] Achievement schema cache: fetched once (e.g. on worker startup, or lazily if `steamAchievementSchema` is empty for the configured appId) and upserted into `steamAchievementSchema` — not re-fetched per player or per poll.
- [x] Wire into `pollAndPersistSnapshot` (`snapshot-poller.ts`), **after** `ingestSnapshot`'s transaction has committed: call `refreshUnseenSteamProfiles(db, snapshot.players.map(p => p.steamId))` using the roster already fetched from RCON that poll. No change needed to `ingestSnapshot`/`closeMatch` — this trigger is independent of Match boundaries entirely.
- [x] The refresh call itself must not throw out of `pollAndPersistSnapshot` — same "log and swallow" pattern `pollOnce` already uses for RCON failures, so a Steam outage never takes down snapshot polling.
- [x] Tests: `steam-client.ts` against a mocked `fetch` (batching behavior, private-profile handling, 429/retry handling, schema parsing); `steam-profile-refresh.ts` against a real local Postgres per this repo's existing testing convention (no DB mocks) — covering "already cached, not re-fetched", "previously errored, retried", "private, not retried"; an integration test asserting a poll with a new roster member triggers exactly one summaries call containing that steamId.

Also added, beyond the original checklist:
- `apps/worker/src/steam-fixture.ts` — a `scriptedSteamClient` test seam (mirrors `rcon-fixture.ts`'s `scriptedRconClient`), used by both new test files.
- `STEAM_API_KEY` is read as **optional** in `apps/worker/src/index.ts` (unlike `RCON_TOKEN`, which is required) — a deployment without a key yet still boots and polls RCON normally, just with Steam enrichment disabled and a one-line log saying so. `pollAndPersistSnapshot`/`pollOnce`/`startSnapshotPolling` all take Steam config as a trailing optional parameter, so this was a non-breaking addition to their signatures.
- `retryAfterSeconds` is captured on `SteamApiError` from the response header when Steam sends one, for observability, but the actual retry pacing uses a fixed 60s cooldown (`ERROR_RETRY_COOLDOWN_MS` in `steam-profile-refresh.ts`) rather than dynamically honoring `Retry-After` — simpler, and already roughly matches Steam's observed 60–120s window, without needing a schema change to persist a per-row next-retry time.
