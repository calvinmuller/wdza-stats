# 01: SteamProfile schema + config

**What to build:** The database shape and config needed for everything else in this feature — no behavior yet. Adds `steamProfiles` (keyed by `steamId` alone, per docs/adr/0002-scope-steamprofile-per-account-not-per-server.md) and a global achievement-schema cache table, plus the `STEAM_API_KEY` env var.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] `packages/db/src/schema.ts`: add `steamProfiles` table — `steamId` (text, PK), `personaName` (text), `avatarUrl` (text, nullable), `achievements` (jsonb: array of `{apiName, unlockedAt}`), `status` (text: `"ok" | "private" | "error"`), `fetchedAt` (timestamptz)
- [x] `packages/db/src/schema.ts`: add `steamAchievementSchema` table — `appId` (integer), `apiName` (text), `displayName` (text), `description` (text, nullable), `iconUrl` (text), PK on `(appId, apiName)`. This is WARDOGS-global metadata (appid `1867240`), not per-player — one row per defined achievement, refreshed rarely.
- [x] Migration generated (`npm run db:generate --workspace=@wdza-stats/db`) and applied to the dev + test databases
- [x] `.env.example`: add `STEAM_API_KEY=` with a comment matching the existing `RCON_TOKEN` comment style — read only by `apps/worker`, never persisted, never reaches `apps/web`
- [x] `CONTEXT.md` and `docs/adr/0002-...` already written (done in the design session) — no further doc changes needed here

Also added `packages/db/src/steam-profile.ts` (not originally listed) for the `SteamAchievementUnlock`/`SteamProfileStatus` types backing the jsonb/status columns, mirroring how `snapshot.ts` backs the `payload` jsonb columns. Exported from `packages/db/src/index.ts`.
