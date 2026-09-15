# 14: Server overview dashboard extensions

**What to build:** Add active daily challenges and a recent-events feed to the existing live "server now" dashboard view, alongside its current Match/players/map/faction-score display. The recent-events feed reads from the Notification records introduced in ticket 10 (already throttled/curated), not the raw GameEvent log, so it doesn't flood the page with every kill.

**Blocked by:** 09: Daily challenges, 10: Notification recording + throttling

**Status:** closed

- [x] The server overview page shows the currently active daily challenges and their progress (if the current Server has an authenticated viewer's per-player progress available; otherwise the challenge definitions and overall status)
- [x] The server overview page shows a recent-events feed sourced from `Notification` records, most recent first
- [x] Existing live view behavior (current Match, players, map, faction scores) is unchanged
- [x] Tests cover: the new sections rendering correctly alongside the existing live view content

## Comments

Closed: implemented on `master` (commit `4021a67`). No authenticated-viewer concept exists anywhere in this codebase (spec.md's "No new authentication system" decision), so the "authenticated viewer" branch of the first checkbox is never reachable today - `apps/web/src/lib/active-challenges.ts`'s `getActiveChallenges` always renders the "otherwise" branch: each active daily `ChallengeInstance`'s definition (type/target/xpReward, described via `describeChallenge`) plus its overall status (`participantCount`/`completedCount` across every player, from `player_challenge_progress`/`challenge_completions`).

`getActiveChallenges` scopes "active" to `dailyPeriodKey(asOf)` where `asOf` is the Snapshot's own `capturedAt` (not wall-clock `now()`), so the dashboard always asks for the same UTC day the Worker most recently generated instances for. `dailyPeriodKey` moved from `apps/worker/src/challenge-engine.ts` into `packages/db/src/challenge.ts` (re-exported from the worker file for its existing callers) so both sides compute the identical key.

`apps/web/src/lib/recent-notifications.ts`'s `getRecentNotifications` reads only the `notifications` table (never `game_events`), ordered `timestamp desc, id desc`, capped at `RECENT_NOTIFICATIONS_LIMIT` (20).

Both are wired into `getLiveSnapshot`/`LiveServerView` (`apps/web/src/lib/live-snapshot.ts`, `apps/web/src/app/live-server.tsx`) so the new "Today's challenges" and "Recent activity" sections refresh on the same poll cycle as the rest of the live view; the existing Match/players/map/faction-score markup is untouched (verified by `page.test.ts` still asserting on that content).

Verified via new tests (`active-challenges.test.ts`, `recent-notifications.test.ts`) plus updated `live-snapshot.test.ts`/`page.test.ts`/route tests covering the sections rendering alongside existing content. Full suite and typecheck pass, aside from 8 pre-existing `match-tracker.test.ts` failures on `master` unrelated to this ticket (confirmed via `git stash`).
