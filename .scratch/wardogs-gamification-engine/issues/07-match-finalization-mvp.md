# 07: Match finalization: MVP + win/loss rollup

**What to build:** At `MatchEnded`, finalize that Match's outcome: compute the winning Faction (the Faction with the strictly highest final score, consistent with ticket 03's strict-overtake lead semantics — matches spec's "first Faction to 100 wins"), compute the MVP among that Match's players using a configurable formula (seeded default: kills×10 − deaths×5), and persist `mvpPlayerSteamId`/`mvpScore` on the Match row. Roll the outcome into each involved player's `playerCareerStats`: increment `matchesWon` or `matchesLost` based on their Faction, and increment `mvpCount` for the MVP. All of this must be idempotent — reprocessing the same `MatchEnded` event must not double-count.

**Blocked by:** 02: Match lifecycle + kill/death events, 03: Faction score events

**Status:** closed

- [x] `winningFaction` is set correctly on Match close, using the same strict-overtake logic as `FactionTookLead`
- [x] MVP formula is config-driven, not hardcoded; `mvpPlayerSteamId`/`mvpScore` persisted on the Match
- [x] `matchesWon`/`matchesLost`/`mvpCount` on `playerCareerStats` update correctly for every player who participated in the Match
- [x] Reprocessing the same `MatchEnded` event does not double-increment any of these
- [x] Tests cover: a normal win/loss split, an MVP tie-break rule (documented, whatever's chosen), and idempotent reprocessing

## Comments

Closed: already implemented on `master` (commit `512e00e`). `winningFaction` (`apps/worker/src/match-tracker.ts`) delegates to `soleLeader` in `game-events.ts`, the same strict-overtake comparison `FactionTookLead` uses. MVP scoring is config-driven via the new `mvp_formula_weights` table (seeded `kills: 10, deaths: -5` in migration `0010_spooky_fantastic_four.sql`), computed by `apps/worker/src/mvp-engine.ts`'s `computeMvp`/`mvpScoreFor`, with a documented tie-break order (higher score, then more kills, then fewer deaths, then smaller steamId). `closeMatch` persists `mvpPlayerSteamId`/`mvpScore` on the Match row and rolls `matchesWon`/`matchesLost`/`mvpCount` into `playerCareerStats` via `onConflictDoUpdate`. Idempotency is enforced by claiming `endedAt` with a conditional `UPDATE ... WHERE endedAt IS NULL`: a second `closeMatch` call for an already-closed Match finds no row to claim and returns early before touching any rollup.

Verified via `apps/worker/src/mvp-engine.test.ts` (formula + all tie-break rules) and `apps/worker/src/match-tracker.test.ts` (win/loss split, MVP stamping, and reprocessing idempotency at lines ~1084-1206). Full suite (231 tests) and typecheck pass.
