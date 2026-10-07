# The Worker mirrors the game server's bans

The v1 spec kept bans, the audit log and reserved slots out of the system entirely (#27): no code path fetched them, so moderation data could never leak onto a public page. We now want one public list of everyone banned, and a player banned in-game should drop out of the stats just like one a moderator banned in the admin area. So the Worker reads RCON's `GET /v1/bans` on every Snapshot poll and copies it into `banned_players` as `source: "server"` rows, which the public `/api/bans` route serves together with the admin area's `source: "site"` bans. The audit log and reserved slots stay out of scope.

## Considered Options
- The web app calls `/v1/bans` directly on each request — rejected: it would put the full-access RCON token in the web service, undoing #25–26, which keep the token's exposure to the Worker alone.
- A separate table for server bans — rejected: every public read and the Worker's Snapshot filter already key off `banned_players`, so a second table would mean a second filter everywhere.

## Consequences
- A ban lifted on the game server deletes its `server` row on the next poll; a `site` row is never touched by the sync.
- A site ban wins over a server ban for the same steamId: banning a steamId the game already bans turns it into a `site` row, so lifting it in-game doesn't lift it on the site. A `server` ban can only be lifted in-game, so the admin area offers no Unban for it.
- The game server's `bannedBy` is never stored or shown. Its ban reasons are, since `/api/bans` is public.
- Bans from the game server's config file carry no real date (`bannedAtUtc` is `0001-01-01`); they are dated when the Worker first sees them.
- A failed `/v1/bans` read keeps the last synced list and never stops Snapshot polling.
