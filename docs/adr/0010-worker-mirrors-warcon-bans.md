# The Worker mirrors WDZA's Warcon ban list

The v1 spec kept bans, the audit log and reserved slots out of the system entirely (#27): no code path fetched them, so moderation data could never leak onto a public page. We now want one public list of everyone banned, and a player banned by WDZA's moderators should drop out of the stats just like one banned in our own admin area. Those moderators keep the org's ban list in Warcon (console.warcon.app), which applies it to the game server. So every minute the Worker reads `GET /api/orgs/{id}/lists/ban/entries` from Warcon with an org API key and copies the active bans into `banned_players` as `source: "warcon"` rows. The public `/api/bans` route serves them together with the admin area's `source: "site"` bans. The audit log and reserved slots stay out of scope.

## Considered Options
- RCON `GET /v1/bans` — tried first, then replaced: it only has what Warcon already pushed to the game server, plus the server's config-file bans, which come with no date (`0001-01-01`). Warcon has each ban's real date, its reason and its expiry.
- The web app calls Warcon on each request — rejected: the API key can also edit the org's lists, so like the RCON token (#25–26) it stays in the Worker's environment alone.
- A separate table for Warcon bans — rejected: every public read and the Worker's Snapshot filter already key off `banned_players`, so a second table would mean a second filter everywhere.

## Consequences
- A ban removed or expired in Warcon deletes its `warcon` row on the next sync; a `site` row is never touched by the sync.
- A site ban wins over a Warcon ban for the same steamId: banning a steamId Warcon already bans turns it into a `site` row, so lifting it in Warcon doesn't lift it here. A `warcon` ban can only be lifted in Warcon, so the admin area offers no Unban for it.
- A new Warcon ban takes up to a minute to start filtering Snapshots.
- Warcon's `addedByName` is never stored or shown. Its ban reasons are, since `/api/bans` is public.
- Bans only in the game server's config file, never in Warcon, are not mirrored.
- Without `WARCON_API_KEY` and `WARCON_ORG_ID` the sync is off, and a failed Warcon read keeps the last synced list.
