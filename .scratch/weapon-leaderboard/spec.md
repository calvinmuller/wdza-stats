Status: ready-for-human

# Weapon leaderboard: who gets the most kills with one weapon

## Problem Statement

The kill feed (`.scratch/kill-feed/spec.md`) records which weapon every Kill was made with, and the player page already shows each player's own top weapons. There is no way to answer the question the community actually asks: "who is the best with the SVD this week?" The Leaderboard and Rankings only rank Snapshot-derived totals, which carry no weapon, and only by Season or Career, never by a recent span of time.

## Solution

A `/weapons` page that ranks players by Kills with one selected weapon within one selected **Window** (see `CONTEXT.md`): the last 7 days, the last 30 days, the current Season, or all time. Confirmed with the client: rows are players, one weapon at a time (not a ranking of weapons).

## Domain Decisions (from grilling + domain-modeling session)

- **New term `Window`**: a rolling span of wall-clock time ending now, in which Kills are counted by the moment the feed delivered them. Distinct from a Season: no fixed start, not tied to Matches, shifts every time the page is opened. Only Kills can be scoped to a Window; Snapshot-derived stats never are. Glossary updated.
- **Rolling, not calendar.** "7 days" is the last 7 × 24 hours from now, so no timezone decision is needed. Default is the last 7 days.
- **Scope options** on one picker: Last 7 days, Last 30 days, the current Season, All time. In a Season, only Kills whose Match belongs to that Season count (as the player page's weapon stats already do). In a Window and in All time, Kills that arrived while no Match was open count too.
- **Source is the kill feed only**, so the leaderboard starts from when the feed was switched on, like the player page's Top weapons panel. The page says so.
- **A weapon is any Kill cause tag**: hand-held weapons and vehicle-mounted weapons alike, named by the same map the kill feed uses. Roadkills and vehicle explosions are not a weapon and never count.
- **Weapon list**: every weapon with at least one Kill on the Server, all time, alphabetical by display name. It does not shrink when a shorter Window is chosen; a weapon with no Kills in the Window shows an empty state instead.
- **Default weapon**: the most-used weapon in the selected scope, so the page is never empty. After a pick, the URL carries the weapon so links are shareable. A weapon in the URL that nobody has ever used is a 404, so a mistyped link never quietly shows a different weapon.
- **Exclusions** match the rest of the site: banned players are hidden; suicides and killerless deaths are nobody's Kill. Team kills count until team-kill detection exists.
- **Rows**: top 50. Rank, player (PlayerCareerStat display name, with the name on the player's latest Kill as a fallback for a player who has never finished a Match; SteamProfile avatar and country; linked to the player page), Kills, Headshots. Ranked by Kills; ties broken by Headshots, then display name.
- **Header** above the table: the weapon's thumbnail, name, total Kills in the scope, and how many players are ranked.
- **Empty states**: "No kills recorded by the kill feed yet." when the feed has never delivered a Kill on this Server; "Nobody got a kill with the AK74 in the last 7 days." (or "in Season 3", or "yet" for All time) for an empty weapon and scope.
- **Picker labels**: Last 7 days / Last 30 days / Season N / All time, carried in the URL as `window=7d|30d|season|all`. The weapon is carried as a slug of its display name (`weapon=ak74`), resolved back to the cause tag through the Server's weapon list.

## Implementation Decisions

- Computed on read from the `kills` table; no rollup. A `(server_id, cause, received_at)` index serves both the weapon list and the per-weapon scope query. Revisit if the table grows past a few million rows.
- The Season scope reuses the existing `matches.season_id` attribution via `kills.match_row`.
- No ADR: adding Windows beside Seasons is a real trade-off but cheap to reverse; the glossary entry carries the reasoning.

## Out of Scope

- A public JSON endpoint for the weapon leaderboard.
- Distance columns (longest / average shot).
- A ranking of weapons themselves (a "most used weapons" index page).
- Linking from the player page's Top weapons panel to this page.
- Per-weapon Achievements or Challenges.
