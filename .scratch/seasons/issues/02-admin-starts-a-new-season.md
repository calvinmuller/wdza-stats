Status: ready-for-agent

# 02: Admin starts a new Season

**What to build:** An admin can start the next Season by hand from the admin area: they see the current Season, optionally enter a name for the next one, confirm through a step that names it ("Start Season 2 now? Every leaderboard will switch to Season 2"), and the new Season becomes current immediately. Matches that open afterwards count towards it; Matches already in progress finish in the previous Season. This is the minimum needed for 15 October. See `.scratch/seasons/spec.md`.

**Blocked by:** 01 (Seasons exist and the worker records PlayerSeasonStat).

- [ ] Only the `admin` Role can start a Season; moderators and signed-out visitors cannot (enforced server-side, not just hidden in the UI).
- [ ] The next Season's number is always the current Season's number + 1; the admin cannot choose it. The name is optional.
- [ ] Starting requires an explicit confirmation step naming the Season number (and name, if given).
- [ ] The new Season's start is recorded as the moment it was started, and it becomes the current Season for every Server at once.
- [ ] Two admins pressing start at the same time cannot create two Seasons with the same number or two current Seasons.
- [ ] Starting a Season is recorded in the staff audit log like other staff actions.
- [ ] The admin page lists past Seasons with their numbers, names, and start dates.
- [ ] Test: a Match open when the Season is started is credited to the previous Season on close; a Match opened afterwards is credited to the new Season.
- [ ] Test: a non-admin attempt to start a Season is rejected and creates nothing.
