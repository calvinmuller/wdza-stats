import type { GameEventType, SnapshotFaction, SnapshotPlayer } from "@wdza-stats/db";

/** Everything a poll's roster diff needs to attribute and dedupe its events, gathered before diffing so the diff function stays pure. */
export interface RosterDiffContext {
  serverId: number;
  matchId: number;
  timestamp: Date;
  sourceSnapshotId: number;
}

export interface GameEventDraft {
  serverId: number;
  matchId: number;
  type: GameEventType;
  timestamp: Date;
  steamId: string | null;
  targetSteamId: string | null;
  faction: string | null;
  metadata: Record<string, unknown> | null;
  sourceSnapshotId: number;
  idempotencyKey: string;
}

/**
 * Deterministic from the event's own identity alone (Server, Match, type,
 * plus whatever further parts a given event type needs to stay unique -
 * steamId+timestamp for a join/leave, a resulting counter value for a
 * kill/death) - never from an auto-incrementing id like sourceSnapshotId,
 * which would differ across a retried write of the same transition.
 * Persisting two drafts with the same key is a no-op (see ingestSnapshot's
 * onConflictDoNothing), which is what makes re-running the same Snapshot
 * comparison safe.
 */
function buildIdempotencyKey(context: RosterDiffContext, type: GameEventType, ...parts: string[]): string {
  return [context.serverId, context.matchId, type, ...parts].join(":");
}

function joinLeaveEvent(
  type: GameEventType,
  player: SnapshotPlayer,
  context: RosterDiffContext,
): GameEventDraft {
  return {
    serverId: context.serverId,
    matchId: context.matchId,
    type,
    timestamp: context.timestamp,
    steamId: player.steamId,
    targetSteamId: null,
    faction: player.faction,
    metadata: null,
    sourceSnapshotId: context.sourceSnapshotId,
    idempotencyKey: buildIdempotencyKey(context, type, player.steamId, context.timestamp.toISOString()),
  };
}

/**
 * `PlayerJoined` for a steamId present in `currentPlayers` but absent from
 * `previousPlayers`, `PlayerLeft` for the reverse - no debounce, every
 * roster diff between consecutive Snapshots is taken literally (see
 * CONTEXT.md's GameEvent entry and spec.md's domain decisions). A missing
 * `previousPlayers` (the first Snapshot this process has ever ingested for
 * the Server) is treated as an empty roster, so every currently-online
 * player is reported as freshly joined - mirroring
 * snapshot-poller.ts's newlyJoinedSteamIds.
 *
 * A `PlayerJoined` records the Faction the player is on in the current
 * Snapshot; a `PlayerLeft` records the last Faction they were seen on, since
 * they no longer appear in the current one.
 */
export function diffRosterGameEvents(
  previousPlayers: SnapshotPlayer[] | undefined,
  currentPlayers: SnapshotPlayer[],
  context: RosterDiffContext,
): GameEventDraft[] {
  const previous = previousPlayers ?? [];
  const previousSteamIds = new Set(previous.map((player) => player.steamId));
  const currentSteamIds = new Set(currentPlayers.map((player) => player.steamId));

  const joined = currentPlayers
    .filter((player) => !previousSteamIds.has(player.steamId))
    .map((player) => joinLeaveEvent("PlayerJoined", player, context));

  const left = previous
    .filter((player) => !currentSteamIds.has(player.steamId))
    .map((player) => joinLeaveEvent("PlayerLeft", player, context));

  return [...joined, ...left];
}

/**
 * `MatchStarted`/`MatchEnded` are Match-scoped, not player-scoped - there is
 * no steamId to attribute them to. `matchId` in `context` must be the
 * started/ended Match's own id (never the Match that's open by the time the
 * event is persisted), which is what lets a Match's `MatchEnded` and the
 * *next* Match's `MatchStarted` carry distinct matchIds even though both are
 * produced by the same boundary-crossing Snapshot. Keyed on Server + Match +
 * type alone (no timestamp): a Match opens and closes exactly once, so that
 * triple is already a stable identity, unlike PlayerJoined/PlayerLeft which
 * can repeat for the same steamId within a Match.
 */
export function matchLifecycleEvent(
  type: "MatchStarted" | "MatchEnded",
  context: RosterDiffContext,
): GameEventDraft {
  return {
    serverId: context.serverId,
    matchId: context.matchId,
    type,
    timestamp: context.timestamp,
    steamId: null,
    targetSteamId: null,
    faction: null,
    metadata: null,
    sourceSnapshotId: context.sourceSnapshotId,
    idempotencyKey: buildIdempotencyKey(context, type),
  };
}

/**
 * One event per unit increase from `previousCount` to `currentCount` -
 * a player going from 2 kills to 5 produces three separate `PlayerKilled`
 * drafts, not one draft carrying a delta of 3, so each kill is its own
 * countable GameEvent for the XP/streak engines downstream. Keyed on the
 * resulting counter value rather than the timestamp: within a Match a
 * counter only moves forward (a drop is a Match boundary, handled
 * separately - see detectMatchBoundary), so each value a counter passes
 * through is already a stable, non-repeating identity for that counter.
 */
function counterDeltaEvents(
  type: "PlayerKilled" | "PlayerDeath",
  player: SnapshotPlayer,
  previousCount: number,
  currentCount: number,
  context: RosterDiffContext,
): GameEventDraft[] {
  const events: GameEventDraft[] = [];
  for (let count = previousCount + 1; count <= currentCount; count++) {
    events.push({
      serverId: context.serverId,
      matchId: context.matchId,
      type,
      timestamp: context.timestamp,
      steamId: player.steamId,
      targetSteamId: null,
      faction: player.faction,
      metadata: null,
      sourceSnapshotId: context.sourceSnapshotId,
      idempotencyKey: buildIdempotencyKey(context, type, player.steamId, String(count)),
    });
  }
  return events;
}

/**
 * `PlayerKilled`/`PlayerDeath` for every steamId present in both rosters,
 * inferred from their kill/death counter deltas between consecutive
 * Snapshots. Callers must only invoke this when the Snapshot pair does
 * *not* cross a Match boundary (see detectMatchBoundary in
 * match-tracker.ts) - a counter reset at a boundary is a new Match, never a
 * batch of deaths, and diffing across it would misread the reset as such.
 * A player absent from `previousPlayers` (freshly joined mid-Match, so
 * there's no prior count to diff against) is skipped rather than treated as
 * a 0 baseline, which would otherwise misreport their entire pre-join kill
 * count as fresh kills the moment they're first observed.
 */
export function diffKillDeathGameEvents(
  previousPlayers: SnapshotPlayer[],
  currentPlayers: SnapshotPlayer[],
  context: RosterDiffContext,
): GameEventDraft[] {
  const previousBySteamId = new Map(previousPlayers.map((player) => [player.steamId, player]));

  return currentPlayers.flatMap((player) => {
    const previous = previousBySteamId.get(player.steamId);
    if (!previous) {
      return [];
    }
    return [
      ...counterDeltaEvents("PlayerKilled", player, previous.kills, player.kills, context),
      ...counterDeltaEvents("PlayerDeath", player, previous.deaths, player.deaths, context),
    ];
  });
}

function factionScoreChangedEvent(
  faction: SnapshotFaction,
  previousScore: number,
  context: RosterDiffContext,
): GameEventDraft {
  return {
    serverId: context.serverId,
    matchId: context.matchId,
    type: "FactionScoreChanged",
    timestamp: context.timestamp,
    steamId: null,
    targetSteamId: null,
    faction: faction.name,
    metadata: { previousScore, newScore: faction.score },
    sourceSnapshotId: context.sourceSnapshotId,
    idempotencyKey: buildIdempotencyKey(context, "FactionScoreChanged", faction.name, String(faction.score)),
  };
}

function factionTookLeadEvent(faction: SnapshotFaction, context: RosterDiffContext): GameEventDraft {
  return {
    serverId: context.serverId,
    matchId: context.matchId,
    type: "FactionTookLead",
    timestamp: context.timestamp,
    steamId: null,
    targetSteamId: null,
    faction: faction.name,
    metadata: null,
    sourceSnapshotId: context.sourceSnapshotId,
    idempotencyKey: buildIdempotencyKey(context, "FactionTookLead", faction.name, String(faction.score)),
  };
}

/**
 * The sole Faction whose score strictly exceeds every other Faction's -
 * null when the list is empty or when the top score is shared by more than
 * one Faction, since a tie has no sole leader. Exported so match-tracker.ts
 * can compute it for a Match's boundary Snapshot as the fallback
 * `previousLeader` when this Match has no `FactionTookLead` row yet - that
 * Snapshot's own leader (or lack of one, on the far more common tied/zero
 * start) is what "not already the sole leader" must be judged against, not
 * an assumed-null baseline that would misfire if a Match ever opened with
 * an existing spread.
 */
export function soleLeader(factions: SnapshotFaction[]): SnapshotFaction | null {
  if (factions.length === 0) {
    return null;
  }
  const [first, second] = [...factions].sort((a, b) => b.score - a.score);
  if (second && second.score === first.score) {
    return null;
  }
  return first;
}

/**
 * `FactionScoreChanged` for each Faction present in both `previousFactions`
 * and `currentFactions` whose score differs between them, carrying the old
 * and new score in metadata. `FactionTookLead` fires when the current sole
 * leader (see soleLeader) differs from `previousLeader` - the name of
 * whichever Faction most recently strictly took the lead in this Match, per
 * the caller's own history (not necessarily the immediately-previous
 * Snapshot's leader), which is what makes a tie a no-op for "who's leading"
 * rather than resetting it: a tied Snapshot's soleLeader is null, so it
 * never overwrites `previousLeader`, and the prior leader keeps the lead
 * until someone strictly passes them (see spec.md's Domain Decisions).
 *
 * A Faction absent from `previousFactions` is skipped for
 * `FactionScoreChanged` rather than diffed against a 0 baseline, mirroring
 * diffKillDeathGameEvents - callers only invoke this for consecutive
 * Snapshots within the same Match (see match-tracker.ts's `!isBoundary`
 * guard), so `previousFactions` is never a stale prior Match's state.
 */
export function diffFactionScoreGameEvents(
  previousFactions: SnapshotFaction[],
  currentFactions: SnapshotFaction[],
  previousLeader: string | null,
  context: RosterDiffContext,
): GameEventDraft[] {
  const previousByName = new Map(previousFactions.map((faction) => [faction.name, faction.score]));

  const events: GameEventDraft[] = currentFactions
    .filter((faction) => {
      const previousScore = previousByName.get(faction.name);
      return previousScore !== undefined && previousScore !== faction.score;
    })
    .map((faction) => factionScoreChangedEvent(faction, previousByName.get(faction.name)!, context));

  const leader = soleLeader(currentFactions);
  if (leader && leader.name !== previousLeader) {
    events.push(factionTookLeadEvent(leader, context));
  }

  return events;
}
