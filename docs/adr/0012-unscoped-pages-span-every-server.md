# Unscoped pages span every Server

[ADR 0011](./0011-servers-are-managed-in-admin.md) treated a URL with no Server in it as "the default Server". `/` went straight to the only Server, and `/players/{steamId}` redirected to that player's page on the default Server. Once a deployment tracks more than one Server, the home page should be about all of them. We decided that an unscoped URL means "across every Server". `/` shows the current Season's **Podium**, the Season's most-used weapons, and a live card for each Server, and it does this even when there is only one Server. `/players/{steamId}` shows the player's **PlayerOverallStat**, with a per-Server breakdown that links to each Server's own player page.

PlayerCareerStat, PlayerSeasonStat, XP and level all stay per-Server. The cross-Server totals are added up when a page is read and are never stored. The overall level is worked out from career XP summed across enabled Servers, on the same level curve every Server uses. It is for display only and unlocks nothing.

## Considered Options
- Keep `/players/{steamId}` redirecting and put the overview at a new path such as `/players/{steamId}/overall`. Rejected: it would give the plain URL two different meanings, the default Server for players and every Server for `/`.
- Store a cross-Server total per player. Rejected: it would be a second source of truth that the Worker has to keep in step, all for one page.
- Show each player's highest per-Server level instead of an overall level. Rejected in favour of a level from summed XP, which rewards playing on every Server.

## Consequences
- Old player links now land on the overview, not on the default Server's page. `/players` (the list) and the other old top-level URLs still redirect to the default Server.
- Only enabled Servers count, so disabling a Server can lower a player's overall level and can change the Podium.
