# 03: Faction score events

**What to build:** GameEvents that track how a Match's Faction scores move: `FactionScoreChanged` whenever any Faction's running score changes between consecutive Snapshots, and `FactionTookLead` when a Faction becomes the sole highest-scoring Faction by strictly overtaking the previous leader — a tie never counts as a lead change, and the prior leader keeps the lead until someone strictly passes them.

**Blocked by:** 01: Event log foundation + player join/leave detection

**Status:** closed

- [x] `FactionScoreChanged` fires for each Faction whose score differs between two consecutive Snapshots within the same Match, carrying old and new score in metadata
- [x] `FactionTookLead` fires only when a Faction's score strictly exceeds every other Faction's current score and it was not already the sole leader
- [x] A score change that produces a tie for the lead does not fire `FactionTookLead`, and does not change which Faction is considered "leading" for the purpose of the next comparison
- [x] Idempotent against retried snapshot comparisons
- [x] Tests cover: a normal score increase, two Factions tying, and a Faction overtaking a tie to take sole lead

## Comments

Closed: `FactionScoreChanged`/`FactionTookLead` added to `GameEventType` (`packages/db/src/game-event.ts`); `GameEventDraft.metadata` widened from `null` to `Record<string, unknown> | null` to carry `{previousScore, newScore}`. New pure `diffFactionScoreGameEvents`/`soleLeader` helpers in `apps/worker/src/game-events.ts`, wired into `ingestSnapshot` in `apps/worker/src/match-tracker.ts` under the same `!isBoundary` guard as kill/death diffing.

"Leading" state is sticky across a tie by querying this Match's most recent `FactionTookLead` row (not just the immediately-previous Snapshot) as `previousLeader`, so a tie never resets who's considered leading and a prior leader regaining sole lead after a tie doesn't re-fire the event. When no such row exists yet, falls back to the previous Snapshot's own sole leader (via the now-exported `soleLeader`) rather than assuming null - otherwise a Match whose boundary Snapshot already showed a non-tied spread (nothing guarantees factions reset to 0-0 at a boundary; `detectMatchBoundary` never checks them) would misreport its pre-existing leader as freshly "taking" the lead. Caught by `/code-review`'s Spec axis and fixed, with a regression test covering exactly that scenario.

Reviewed via `/code-review` against spec.md/this ticket and the repo's standards/smell baseline: Standards axis found zero violations (minor pre-existing judgement calls only, not introduced by this diff); Spec axis found the boundary-spread gap above, since fixed. Full test suite (171 tests) and typecheck pass.
