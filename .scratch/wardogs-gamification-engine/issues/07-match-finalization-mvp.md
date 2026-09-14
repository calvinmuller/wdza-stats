# 07: Match finalization: MVP + win/loss rollup

**What to build:** At `MatchEnded`, finalize that Match's outcome: compute the winning Faction (the Faction with the strictly highest final score, consistent with ticket 03's strict-overtake lead semantics — matches spec's "first Faction to 100 wins"), compute the MVP among that Match's players using a configurable formula (seeded default: kills×10 − deaths×5), and persist `mvpPlayerSteamId`/`mvpScore` on the Match row. Roll the outcome into each involved player's `playerCareerStats`: increment `matchesWon` or `matchesLost` based on their Faction, and increment `mvpCount` for the MVP. All of this must be idempotent — reprocessing the same `MatchEnded` event must not double-count.

**Blocked by:** 02: Match lifecycle + kill/death events, 03: Faction score events

**Status:** ready-for-agent

- [ ] `winningFaction` is set correctly on Match close, using the same strict-overtake logic as `FactionTookLead`
- [ ] MVP formula is config-driven, not hardcoded; `mvpPlayerSteamId`/`mvpScore` persisted on the Match
- [ ] `matchesWon`/`matchesLost`/`mvpCount` on `playerCareerStats` update correctly for every player who participated in the Match
- [ ] Reprocessing the same `MatchEnded` event does not double-increment any of these
- [ ] Tests cover: a normal win/loss split, an MVP tie-break rule (documented, whatever's chosen), and idempotent reprocessing
