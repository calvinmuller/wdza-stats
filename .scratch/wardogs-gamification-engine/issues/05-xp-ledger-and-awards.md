# 05: XP ledger + XP awards

**What to build:** An immutable `xp_transactions` ledger and the Progression Engine logic that awards XP for kills, match completion, match wins, first blood, and kill-streak milestones (3/5/10), using a config-driven `XP_REWARDS` table seeded with the spec's defaults (kill +100, match completed +250, match win +500, first blood +100, streak3 +150, streak5 +250, streak10 +500) rather than hardcoded values. Each award is one ledger row keyed to the GameEvent that caused it, so the same event can never award XP twice even if reprocessed. `playerCareerStats.xp` is a cached running total, kept in sync with the ledger, used for fast leaderboard reads — the ledger remains the source of truth.

**Blocked by:** 02: Match lifecycle + kill/death events, 04: Kill streak tracking

**Status:** closed

- [x] `xp_transactions` records one row per award (steamId, amount, reason, eventId, createdAt), with a uniqueness guarantee on (eventId, reason) or equivalent so double-processing never double-awards
- [x] `XP_REWARDS` values live in a config table/row, not inline in application logic
- [x] Kills, match completion, match wins, first blood, and each streak milestone (3/5/10) award the correct configured amount exactly once
- [x] `playerCareerStats.xp` always equals the sum of that player's ledger entries for that Server
- [x] Tests cover: a kill awarding XP once even if the triggering event is reprocessed, first blood firing only for the actual first kill of a Match, and each streak milestone firing exactly once as the streak crosses it

## Comments

Closed: new `xp_rewards` (config: `reason` -> `amount`) and `xp_transactions` (the immutable ledger) tables in `packages/db/src/schema.ts`, migration `0008_same_whiplash.sql` seeding `xp_rewards`' defaults from spec.md via `INSERT ... ON CONFLICT DO NOTHING`. `XpReason` union lives in `packages/db/src/xp.ts`. New pure `computeXpTransactionDrafts` in `apps/worker/src/xp-engine.ts` (mirrors game-events.ts's pure-diff style), wired into `ingestSnapshot` in `apps/worker/src/match-tracker.ts` right after GameEvents are persisted.

The uniqueness guarantee is `(event_id, reason, steam_id)` rather than the ticket's literal `(event_id, reason)`: `MatchEnded` is a single Match-scoped GameEvent that fans out `match_completed`/`match_win` to every participant under one `eventId`, so `steam_id` has to be part of the key or only the first participant's transaction would survive `onConflictDoNothing`. `applyXpTransactionDrafts` persists via a plain `UPDATE` to `playerCareerStats.xp` (not an upsert) since every award reason here fires only after a step that already guarantees the target row exists (`applyKillStreakUpdates` for kill/first_blood/streak reasons, `closeMatch` for match_completed/match_win).

Reviewed via `/code-review` against spec.md/this ticket and the repo's standards/smell baseline, both fixed:
- **Standards axis**: flagged that `XpAwardDraft`/`computeXpAwards`/`applyXpAwards` drifted into "XP award", a synonym CONTEXT.md's `XpTransaction` entry explicitly says to avoid, unlike `game-events.ts`'s `GameEventDraft` naming its pre-persistence type after the domain entity itself. Renamed throughout to `XpTransactionDraft`/`computeXpTransactionDrafts`/`applyXpTransactionDrafts` (and internal helpers `killDrafts`/`streakMilestoneDrafts`/`matchCompletionDrafts`).
- **Spec axis**: no missing/wrong requirements; flagged a stale doc comment on `computeXpAwards` still describing the uniqueness guard as `(event_id, reason)` after the schema had already moved to the three-column constraint. Fixed as part of the same rename pass.

Full test suite (203 tests) and typecheck pass.
