Status: done

# 01: The `/weapons` page ranks players by Kills with one weapon in one Window

**What to build:** A public `/weapons` page, linked from the nav as "Weapons", with a weapon picker and a scope picker (Last 7 days, Last 30 days, current Season, All time), a header for the selected weapon, and a top-50 table of players ranked by Kills with it. See `.scratch/weapon-leaderboard/spec.md` and the **Window** and **Kill** entries in `CONTEXT.md`.

**Blocked by:** None.

- [x] `kills` gains an index on `(server_id, cause, received_at)`, as a migration.
- [x] A client-safe module defines the scope (`7d`, `30d`, `season`, `all`), its labels, and the phrase used in empty states; a server helper resolves the query value, defaulting to `7d` and returning null for anything else so the page can 404.
- [x] The weapon list is every cause tag with at least one Kill by a non-banned killer on the Server (suicides, killerless deaths, roadkills and vehicle explosions excluded), alphabetical by display name, each with a URL slug of its display name.
- [x] The leaderboard query groups the scope's Kills for one weapon by killer, excluding banned players, with the career display name (falling back to the name on the killer's latest Kill), SteamProfile avatar and country, Kills and Headshots; ordered by Kills, Headshots, name; limited to 50. A summary gives total Kills and distinct players in the scope.
- [x] The page resolves the scope and weapon from the URL (unknown scope or weapon → 404; absent weapon → most used in the scope, then first in the list), renders the pickers, header, table, and the three empty states.
- [x] "Weapons" appears in the nav after Leaderboard.
- [x] Tests: the lib ranks by kills then headshots then name; a 7-day Window excludes a Kill delivered 8 days ago; a Season scope counts only Kills of that Season's Matches; banned killers and suicides are excluded; a killer with no career row keeps their latest Kill name. The page renders the default weapon, the empty states, and 404s for an unknown weapon or window.

## Comments

Implemented (uncommitted at time of writing).

- Scope lives in `apps/web/src/lib/kill-scope.ts` (client-safe: params, labels, phrases) and `kill-scope-resolve.ts` (query value → KillScope, current Season looked up). All time reuses SeasonScope's `career` kind so the Season branch can share the player page's `matches.season_id` attribution.
- Queries in `apps/web/src/lib/weapon-leaderboard.ts`: `listServerWeapons`, `mostUsedWeapon`, `getWeaponLeaderboard`. The Season scope is a `match_row IN (select id from matches where season_id = …)` condition rather than a join, so every scope is just a WHERE clause. Roadkills and vehicle explosions are excluded by tag (`tags @> '["RoadKill"]'`), whatever cause the game put on them.
- `weaponSlug` (`weapon-slug.ts`) is the display name slugged; resolved only against the Server's own list, so two tags with the same name would collide on the first listed. None do today.
- `WeaponThumbnail` in `components/player-weapons.tsx` now takes a `cause` so the weapons page can reuse it.
- Migration `0031_kills_weapon_index.sql` was generated with drizzle-kit.
- The weapon select is a GET form that submits on change, with a Show button under `<noscript>`: no router, so it renders in the page tests.

