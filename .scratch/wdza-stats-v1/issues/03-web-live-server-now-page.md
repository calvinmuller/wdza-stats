# 03: Web: live "server now" page

**What to build:** A public page where anyone can see what's happening on the WDZA server right now — current map, each Faction's running score with its color, and the list of online players with their current kills/deaths/cash — without logging in, and without the Web app ever calling RCON directly.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] A public page reads the latest Snapshot for the configured Server from Postgres and renders: server name, current map, each Faction's name/color/score, and the online player list (name, faction, kills, deaths, cash, ping)
- [ ] The page auto-refreshes on the client at an interval no faster than the Worker's 15s ingestion cadence, without a full page reload
- [ ] The page renders correctly and remains usable at phone width
- [ ] The Web app process holds no RCON bearer token and makes no request to the RCON API — confirmed by the page working correctly even if the RCON endpoint is unreachable from the Web app's environment
- [ ] Test seam: seeding Postgres with a known Snapshot row and requesting the page returns HTML/response content containing the expected map, scores, and player values
