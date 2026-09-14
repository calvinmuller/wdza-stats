import {
  gameEvents,
  latestSnapshots,
  matchSnapshots,
  matches,
  playerCareerStats,
  playerMatchStats,
  type Database,
  type GameEventType,
  type Snapshot,
  type SnapshotPlayer,
} from "@wdza-stats/db";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  diffFactionScoreGameEvents,
  diffKillDeathGameEvents,
  diffKillStreakGameEvents,
  diffRosterGameEvents,
  matchLifecycleEvent,
  soleLeader,
  type KillStreakUpdate,
} from "./game-events";

/**
 * True when comparing `previous` to `next` indicates a new Match has begun:
 * a changed map, a changed rotation position, or any player's cumulative
 * kills/deaths/cash dropping below their prior value. `lighting` and
 * `alternator` changes are not boundary signals - see
 * docs/adr/0001-infer-match-boundaries-from-snapshot-deltas.md.
 */
export function detectMatchBoundary(previous: Snapshot, next: Snapshot): boolean {
  if (previous.map !== next.map) {
    return true;
  }
  if (previous.rotation.nowIndex !== next.rotation.nowIndex) {
    return true;
  }

  const previousBySteamId = new Map(
    previous.players.map((player) => [player.steamId, player]),
  );

  return next.players.some((player) => {
    const previousPlayer = previousBySteamId.get(player.steamId);
    if (!previousPlayer) {
      return false;
    }
    return (
      player.kills < previousPlayer.kills ||
      player.deaths < previousPlayer.deaths ||
      player.cash < previousPlayer.cash
    );
  });
}

export interface PlayerDelta {
  steamId: string;
  displayName: string;
  faction: string;
  kills: number;
  deaths: number;
  cash: number;
}

/**
 * For every steamId observed across a closed Match's Snapshots (given in
 * capture order), computes the delta between their first- and
 * last-observed counter values, attributing the Faction seen at their last
 * Snapshot in the Match.
 */
export function computePlayerDeltas(snapshots: Snapshot[]): PlayerDelta[] {
  const firstSeen = new Map<string, SnapshotPlayer>();
  const lastSeen = new Map<string, SnapshotPlayer>();

  for (const snapshot of snapshots) {
    for (const player of snapshot.players) {
      if (!firstSeen.has(player.steamId)) {
        firstSeen.set(player.steamId, player);
      }
      lastSeen.set(player.steamId, player);
    }
  }

  return Array.from(firstSeen.keys()).map((steamId) => {
    const first = firstSeen.get(steamId)!;
    const last = lastSeen.get(steamId)!;
    return {
      steamId,
      displayName: last.displayName,
      faction: last.faction,
      kills: last.kills - first.kills,
      deaths: last.deaths - first.deaths,
      cash: last.cash - first.cash,
    };
  });
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * The Faction with the highest score in a Match's final Snapshot - "first to
 * 100" is enforced server-side, so whoever leads when the Match ends is the
 * winner. Returns null when the final Snapshot recorded no Factions.
 */
export function winningFaction(finalSnapshot: Snapshot): string | null {
  if (finalSnapshot.factions.length === 0) {
    return null;
  }
  return finalSnapshot.factions.reduce((leader, faction) =>
    faction.score > leader.score ? faction : leader,
  ).name;
}

/**
 * Closes an open Match: computes each observed player's delta from its
 * retained matchSnapshots, writes PlayerMatchStat rows, rolls those deltas
 * into PlayerCareerStat, stamps endedAt and the winning Faction, and drops
 * the now-redundant raw Snapshots for that Match. Returns a summary for the
 * caller to log once the enclosing transaction has actually committed.
 */
async function closeMatch(
  tx: Tx,
  match: { id: number; serverId: number },
  endedAt: Date,
): Promise<{ winner: string | null; playerCount: number }> {
  const rows = await tx
    .select()
    .from(matchSnapshots)
    .where(eq(matchSnapshots.matchId, match.id))
    .orderBy(matchSnapshots.capturedAt);

  const deltas = computePlayerDeltas(rows.map((row) => row.payload));
  const winner = winningFaction(rows[rows.length - 1].payload);

  for (const delta of deltas) {
    await tx.insert(playerMatchStats).values({
      matchId: match.id,
      steamId: delta.steamId,
      faction: delta.faction,
      kills: delta.kills,
      deaths: delta.deaths,
      cash: delta.cash,
    });

    await tx
      .insert(playerCareerStats)
      .values({
        serverId: match.serverId,
        steamId: delta.steamId,
        displayName: delta.displayName,
        kills: delta.kills,
        deaths: delta.deaths,
        cash: delta.cash,
        matchesPlayed: 1,
      })
      .onConflictDoUpdate({
        target: [playerCareerStats.serverId, playerCareerStats.steamId],
        set: {
          displayName: delta.displayName,
          kills: sql`${playerCareerStats.kills} + ${delta.kills}`,
          deaths: sql`${playerCareerStats.deaths} + ${delta.deaths}`,
          cash: sql`${playerCareerStats.cash} + ${delta.cash}`,
          matchesPlayed: sql`${playerCareerStats.matchesPlayed} + 1`,
        },
      });
  }

  await tx
    .update(matches)
    .set({ endedAt, winningFaction: winner })
    .where(eq(matches.id, match.id));
  await tx.delete(matchSnapshots).where(eq(matchSnapshots.matchId, match.id));

  return { winner, playerCount: deltas.length };
}

/**
 * Persists each affected player's resulting kill-streak state to
 * playerCareerStats - an upsert (rather than a plain update) since a
 * player's very first Match hasn't closed yet by the time their first kill
 * happens, so no playerCareerStats row may exist for them at all (see
 * ticket 01/closeMatch). highestKillStreak is raised via GREATEST rather
 * than overwritten, so it never regresses below a value persisted by an
 * earlier Match.
 */
async function applyKillStreakUpdates(
  tx: Tx,
  serverId: number,
  updates: KillStreakUpdate[],
): Promise<void> {
  for (const update of updates) {
    await tx
      .insert(playerCareerStats)
      .values({
        serverId,
        steamId: update.steamId,
        displayName: update.displayName,
        currentKillStreak: update.currentKillStreak,
        highestKillStreak: update.highestKillStreak,
      })
      .onConflictDoUpdate({
        target: [playerCareerStats.serverId, playerCareerStats.steamId],
        set: {
          displayName: update.displayName,
          currentKillStreak: update.currentKillStreak,
          highestKillStreak: sql`GREATEST(${playerCareerStats.highestKillStreak}, ${update.highestKillStreak})`,
        },
      });
  }
}

/**
 * Ingests one freshly-polled Snapshot for a Server: detects whether it
 * starts a new Match (comparing it to the Server's last-persisted
 * Snapshot), closing and rolling up the previous Match if so, then
 * persists the Snapshot both as the Server's latest state and, scoped to
 * whichever Match is now open, as raw history for that Match's eventual
 * close.
 *
 * A gap in polling needs no special handling: the "previous Snapshot" is
 * always whatever was last persisted, regardless of how long ago that was,
 * so a stale state on resume is detected as an ordinary boundary and the
 * stale Match is closed using that last-known-good Snapshot's timestamp.
 *
 * Also diffs the previous roster against this Snapshot's to emit
 * PlayerJoined/PlayerLeft GameEvents (see game-events.ts), attributed to
 * whichever Match is open by the time the diff runs - the newly-opened one,
 * if this same Snapshot also happened to start one. A MatchEnded/MatchStarted
 * pair is emitted whenever this Snapshot closes and/or opens a Match, each
 * carrying its own Match's id. PlayerKilled/PlayerDeath are emitted from
 * kill/death counter deltas, but only when this Snapshot did *not* cross a
 * Match boundary - a boundary's counter reset must never be misread as a
 * batch of deaths (see diffKillDeathGameEvents). FactionScoreChanged and
 * FactionTookLead are emitted under the same non-boundary guard, diffing
 * Faction scores against the previous Snapshot and against whichever
 * Faction this Match's most recent FactionTookLead event named as leader
 * (a fresh query, not just the previous Snapshot's scores - see
 * diffFactionScoreGameEvents for why a tie must not reset that state).
 * PlayerKillStreakStarted/Increased/Broken are emitted under the same guard,
 * diffing kill/death counters against each player's currentKillStreak as
 * last persisted to playerCareerStats (durable, not worker memory, so a
 * worker restart mid-Match never loses an in-progress streak) - see
 * diffKillStreakGameEvents. Whenever this Snapshot opens a new Match, every
 * player's currentKillStreak on this Server is reset to 0 first, regardless
 * of how their previous Match ended (see spec.md's Domain Decisions).
 * Duplicate drafts (e.g. from a retried write of the same transition) are
 * silently dropped via their idempotencyKey unique constraint rather than
 * erroring.
 *
 * Logs a line for each Match opened and/or closed, and each GameEvent
 * actually inserted - the things a poll can meaningfully change from an
 * operator's point of view, versus the ~15s poll cadence itself which is too
 * frequent to log on every tick. Logged only after the transaction below
 * actually commits, so a rolled-back attempt never gets reported as having
 * happened.
 */
export async function ingestSnapshot(
  db: Database,
  serverId: number,
  snapshot: Snapshot,
  capturedAt: Date,
): Promise<void> {
  let closedMatch: { id: number; winner: string | null; playerCount: number; endedAt: Date } | undefined;
  let openedMatch: { id: number; map: string } | undefined;
  let recordedEvents: Array<{ id: number; type: GameEventType; steamId: string | null; matchId: number }> = [];

  await db.transaction(async (tx) => {
    const [previousRow] = await tx
      .select()
      .from(latestSnapshots)
      .where(eq(latestSnapshots.serverId, serverId))
      .limit(1);

    const [openMatch] = await tx
      .select()
      .from(matches)
      .where(and(eq(matches.serverId, serverId), isNull(matches.endedAt)))
      .limit(1);

    const isBoundary =
      !previousRow || detectMatchBoundary(previousRow.payload, snapshot);

    let currentMatchId: number;

    if (isBoundary) {
      if (openMatch && previousRow) {
        const summary = await closeMatch(tx, openMatch, previousRow.capturedAt);
        closedMatch = { id: openMatch.id, endedAt: previousRow.capturedAt, ...summary };
      }
      const [newMatch] = await tx
        .insert(matches)
        .values({
          serverId,
          map: snapshot.map,
          experiences: snapshot.experiences,
          startedAt: capturedAt,
        })
        .returning();
      currentMatchId = newMatch.id;
      openedMatch = { id: newMatch.id, map: newMatch.map };

      // Kill streaks are Match-scoped: every player on this Server resets to
      // 0 the moment a new Match opens, regardless of how their previous
      // Match ended (see spec.md's Domain Decisions and CONTEXT.md's
      // KillStreak entry).
      await tx
        .update(playerCareerStats)
        .set({ currentKillStreak: 0 })
        .where(eq(playerCareerStats.serverId, serverId));
    } else {
      currentMatchId = openMatch!.id;
    }

    const [insertedSnapshot] = await tx
      .insert(matchSnapshots)
      .values({
        matchId: currentMatchId,
        capturedAt,
        payload: snapshot,
      })
      .returning();

    const eventDrafts = diffRosterGameEvents(previousRow?.payload.players, snapshot.players, {
      serverId,
      matchId: currentMatchId,
      timestamp: capturedAt,
      sourceSnapshotId: insertedSnapshot.id,
    });

    if (closedMatch) {
      eventDrafts.push(
        matchLifecycleEvent("MatchEnded", {
          serverId,
          matchId: closedMatch.id,
          timestamp: closedMatch.endedAt,
          sourceSnapshotId: insertedSnapshot.id,
        }),
      );
    }
    if (openedMatch) {
      eventDrafts.push(
        matchLifecycleEvent("MatchStarted", {
          serverId,
          matchId: openedMatch.id,
          timestamp: capturedAt,
          sourceSnapshotId: insertedSnapshot.id,
        }),
      );
    }
    if (!isBoundary && previousRow) {
      eventDrafts.push(
        ...diffKillDeathGameEvents(previousRow.payload.players, snapshot.players, {
          serverId,
          matchId: currentMatchId,
          timestamp: capturedAt,
          sourceSnapshotId: insertedSnapshot.id,
        }),
      );

      const [lastLeaderEvent] = await tx
        .select({ faction: gameEvents.faction })
        .from(gameEvents)
        .where(and(eq(gameEvents.matchId, currentMatchId), eq(gameEvents.type, "FactionTookLead")))
        .orderBy(desc(gameEvents.id))
        .limit(1);

      // Falls back to the previous Snapshot's own sole leader (not null)
      // when this Match has no FactionTookLead row yet - covers a Match
      // whose boundary Snapshot already showed a non-tied score spread,
      // so that pre-existing leader isn't misreported as "taking" a lead
      // it already held. See soleLeader's doc comment.
      const previousLeader = lastLeaderEvent?.faction ?? soleLeader(previousRow.payload.factions)?.name ?? null;

      eventDrafts.push(
        ...diffFactionScoreGameEvents(previousRow.payload.factions, snapshot.factions, previousLeader, {
          serverId,
          matchId: currentMatchId,
          timestamp: capturedAt,
          sourceSnapshotId: insertedSnapshot.id,
        }),
      );

      const steamIds = snapshot.players.map((player) => player.steamId);
      const streakRows =
        steamIds.length > 0
          ? await tx
              .select({ steamId: playerCareerStats.steamId, currentKillStreak: playerCareerStats.currentKillStreak })
              .from(playerCareerStats)
              .where(and(eq(playerCareerStats.serverId, serverId), inArray(playerCareerStats.steamId, steamIds)))
          : [];
      const currentStreaks = new Map(streakRows.map((row) => [row.steamId, row.currentKillStreak]));

      const killStreakDiff = diffKillStreakGameEvents(previousRow.payload.players, snapshot.players, currentStreaks, {
        serverId,
        matchId: currentMatchId,
        timestamp: capturedAt,
        sourceSnapshotId: insertedSnapshot.id,
      });
      eventDrafts.push(...killStreakDiff.events);
      await applyKillStreakUpdates(tx, serverId, killStreakDiff.updates);
    }

    if (eventDrafts.length > 0) {
      recordedEvents = await tx
        .insert(gameEvents)
        .values(eventDrafts)
        .onConflictDoNothing({ target: gameEvents.idempotencyKey })
        .returning({
          id: gameEvents.id,
          type: gameEvents.type,
          steamId: gameEvents.steamId,
          matchId: gameEvents.matchId,
        });
    }

    await tx
      .insert(latestSnapshots)
      .values({ serverId, capturedAt, payload: snapshot })
      .onConflictDoUpdate({
        target: latestSnapshots.serverId,
        set: { capturedAt, payload: snapshot },
      });
  });

  if (closedMatch) {
    console.log(
      `[worker] match closed: matchId=${closedMatch.id}, winner=${closedMatch.winner ?? "none"}, ${closedMatch.playerCount} player(s)`,
    );
  }
  if (openedMatch) {
    console.log(`[worker] match started: matchId=${openedMatch.id}, map=${openedMatch.map}`);
  }
  for (const event of recordedEvents) {
    const steamIdPart = event.steamId ? `, steamId=${event.steamId}` : "";
    console.log(
      `[worker] game event: type=${event.type}, serverId=${serverId}, matchId=${event.matchId}${steamIdPart}, eventId=${event.id}`,
    );
  }
}
