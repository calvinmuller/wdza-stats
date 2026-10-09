# The Worker mirrors WDZA's Warcon reserved-slot list

[ADR 0010](./0010-worker-mirrors-warcon-bans.md) brought the ban list in from Warcon and kept reserved slots out of scope. We now want a public whitelist page that shows everyone with a reserved slot, next to a public ban list page. The reserved-slot list lives in Warcon too, so the Worker reads it the same way. Every minute, with the same org API key, it reads `GET /api/orgs/{id}/lists/reserve/entries` and replaces the whole `reserved_slots` table with the active entries. The public site shows them at `/whitelist`, and shows the bans at `/bans`. Both links are in the header on every page.

## Considered Options
- Store reserved slots in `banned_players` with a different `source`. Rejected: every ban filter would then need to skip those rows.
- Let Staff Members add reserved slots in the admin area as well. Rejected for now: Warcon is what pushes the list to the game server, so a slot added only here would do nothing in game.

## Consequences
- Warcon owns every `reserved_slots` row. The sync deletes and re-inserts the whole list, and the admin area does not offer edits.
- Warcon's reason for a reserved slot is never stored. It can hold notes meant only for staff, and for a member's slot it holds their Warcon username. Only the steamId, Warcon's last-seen name and the date added are kept.
- Slots that Warcon gives to the org's members are listed with everyone else's.
- A reserved slot changes nothing in the stats. It only appears on `/whitelist`.
- Without `WARCON_API_KEY` and `WARCON_ORG_ID` the list stays empty. A failed Warcon read keeps the last synced list.
