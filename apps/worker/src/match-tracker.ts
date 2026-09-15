import {
  gameEvents,
  latestSnapshots,
  levelForXp,
  levelThresholds,
  matchSnapshots,
  matches,
  mvpFormulaWeights,
  playerCareerStats,
  playerMatchStats,
  xpRewards,
  xpTransactions,
  type Database,
  type GameEventType,
  type Snapshot,
  type SnapshotPlayer,
  type XpReason,
} from "@wdza-stats/db";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  diffFactionScoreGameEvents,
  diffKillDeathGameEvents,
  diffKillStreakGameEvents,
  diffRosterGameEvents,
  matchLifecycleEvent,
  soleLeader,
  type GameEventDraft,
  type KillStreakUpdate,
  type GameEventContext,
} from "./game-events";
import { levelUpEvents } from "./level-engine";
import { computeMvp, type MvpFormulaWeights } from "./mvp-engine";
import {
  computeXpTransactionDrafts,
  type RecordedGameEvent,
  type XpTransactionContext,
  type XpTransactionDraft,
} from "./xp-engine";

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
 * Persists a batch of GameEventDrafts and returns the slice of each actually
 * inserted row that computeXpTransactionDrafts/logging need. Shared by
 * ingestSnapshot's two insertion points - the Snapshot-diff batch and the
 * PlayerLevelUp batch computed afterward from that batch's resulting XP -
 * since both rely on the same onConflictDoNothing(idempotencyKey) dedupe and
 * the same returning() shape.
 */
async function insertGameEventDrafts(tx: Tx, drafts: GameEventDraft[]): Promise<RecordedGameEvent[]> {
  if (drafts.length === 0) {
    return [];
  }
  return tx
    .insert(gameEvents)
    .values(drafts)
    .onConflictDoNothing({ target: gameEvents.idempotencyKey })
    .returning({
      id: gameEvents.id,
      type: gameEvents.type,
      steamId: gameEvents.steamId,
      matchId: gameEvents.matchId,
      metadata: gameEvents.metadata,
    });
}

/**
 * The Faction with the highest score in a Match's final Snapshot - "first to
 * 100" is enforced server-side, so whoever leads when the Match ends is the
 * winner. Delegates to soleLeader for the actual strict-overtake comparison
 * (see game-events.ts), matching FactionTookLead's own semantics (ticket
 * 07): a tied final score has no winner, not an arbitrary pick. Returns null
 * when the final Snapshot recorded no Factions, or when the top score is
 * tied.
 */
export function winningFaction(finalSnapshot: Snapshot): string | null {
  return soleLeader(finalSnapshot.factions)?.name ?? null;
}

/**
 * The current MVP_FORMULA_WEIGHTS config, read fresh on every Match close so
 * the formula can be retuned without a deploy (see schema.ts's
 * mvpFormulaWeights). A component missing from the table contributes 0
 * rather than falling back to a hardcoded default, matching xpRewards'
 * missing-reason handling in xp-engine.ts.
 */
async function fetchMvpFormulaWeights(tx: Tx): Promise<MvpFormulaWeights> {
  const rows = await tx.select().from(mvpFormulaWeights);
  const byComponent = new Map(rows.map((row) => [row.component, row.weight]));
  return {
    killWeight: byComponent.get("kills") ?? 0,
    deathWeight: byComponent.get("deaths") ?? 0,
  };
}

export interface MatchCloseSummary {
  winner: string | null;
  mvpPlayerSteamId: string | null;
  mvpScore: number | null;
  playerCount: number;
}

/**
 * Closes an open Match: computes each observed player's delta from its
 * retained matchSnapshots, writes PlayerMatchStat rows, rolls those deltas
 * into PlayerCareerStat (kills/deaths/cash/matchesPlayed, plus
 * matchesWon/matchesLost/mvpCount per ticket 07), stamps endedAt/
 * winningFaction/mvpPlayerSteamId/mvpScore, and drops the now-redundant raw
 * Snapshots for that Match. Returns a summary for the caller to log once the
 * enclosing transaction has actually committed.
 *
 * Idempotent under reprocessing (ticket 07): the very first write is a
 * conditional claim of `endedAt` (`WHERE endedAt IS NULL`), so a second call
 * for the same already-closed Match finds no row to claim and returns early
 * without touching PlayerMatchStat/PlayerCareerStat again - every increment
 * below only ever runs once per Match, no matter how many times this
 * function itself is invoked for it.
 */
export async function closeMatch(
  tx: Tx,
  match: { id: number; serverId: number },
  endedAt: Date,
): Promise<MatchCloseSummary> {
  const [claimed] = await tx
    .update(matches)
    .set({ endedAt })
    .where(and(eq(matches.id, match.id), isNull(matches.endedAt)))
    .returning({ id: matches.id });

  if (!claimed) {
    const [existing] = await tx.select().from(matches).where(eq(matches.id, match.id));
    return {
      winner: existing.winningFaction,
      mvpPlayerSteamId: existing.mvpPlayerSteamId,
      mvpScore: existing.mvpScore,
      playerCount: 0,
    };
  }

  const rows = await tx
    .select()
    .from(matchSnapshots)
    .where(eq(matchSnapshots.matchId, match.id))
    .orderBy(matchSnapshots.capturedAt);

  const deltas = computePlayerDeltas(rows.map((row) => row.payload));
  const winner = winningFaction(rows[rows.length - 1].payload);
  const weights = await fetchMvpFormulaWeights(tx);
  const mvp = computeMvp(deltas, weights);

  for (const delta of deltas) {
    const won = winner !== null && delta.faction === winner;
    const lost = winner !== null && delta.faction !== winner;
    const isMvp = mvp !== null && delta.steamId === mvp.steamId;

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
        matchesWon: won ? 1 : 0,
        matchesLost: lost ? 1 : 0,
        mvpCount: isMvp ? 1 : 0,
      })
      .onConflictDoUpdate({
        target: [playerCareerStats.serverId, playerCareerStats.steamId],
        set: {
          displayName: delta.displayName,
          kills: sql`${playerCareerStats.kills} + ${delta.kills}`,
          deaths: sql`${playerCareerStats.deaths} + ${delta.deaths}`,
          cash: sql`${playerCareerStats.cash} + ${delta.cash}`,
          matchesPlayed: sql`${playerCareerStats.matchesPlayed} + 1`,
          matchesWon: sql`${playerCareerStats.matchesWon} + ${won ? 1 : 0}`,
          matchesLost: sql`${playerCareerStats.matchesLost} + ${lost ? 1 : 0}`,
          mvpCount: sql`${playerCareerStats.mvpCount} + ${isMvp ? 1 : 0}`,
        },
      });
  }

  await tx
    .update(matches)
    .set({ winningFaction: winner, mvpPlayerSteamId: mvp?.steamId ?? null, mvpScore: mvp?.score ?? null })
    .where(eq(matches.id, match.id));
  await tx.delete(matchSnapshots).where(eq(matchSnapshots.matchId, match.id));

  return {
    winner,
    mvpPlayerSteamId: mvp?.steamId ?? null,
    mvpScore: mvp?.score ?? null,
    playerCount: deltas.length,
  };
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
 * Gathers the extra per-Match state computeXpTransactionDrafts needs beyond
 * the recorded events themselves: the current XP_REWARDS config, each
 * relevant Match's earliest-recorded PlayerKilled event id (for
 * first_blood), and - for a Match this same batch closed - its participant
 * roster and winning Faction (for match_completed/match_win). Queried fresh
 * every call rather than cached, matching this file's existing per-poll
 * query style (e.g. currentStreaks in ingestSnapshot) at a volume too low to
 * matter.
 */
async function buildXpTransactionContext(
  tx: Tx,
  serverId: number,
  recordedEvents: RecordedGameEvent[],
  closedMatch: { id: number; winner: string | null } | undefined,
): Promise<XpTransactionContext> {
  const rewardRows = await tx.select().from(xpRewards);
  const rewards = new Map<XpReason, number>(rewardRows.map((row) => [row.reason, row.amount]));

  const killMatchIds = [...new Set(
    recordedEvents.filter((event) => event.type === "PlayerKilled").map((event) => event.matchId),
  )];
  const firstKillEventIdByMatch = new Map<number, number>();
  for (const matchId of killMatchIds) {
    const [row] = await tx
      .select({ id: sql<number>`MIN(${gameEvents.id})` })
      .from(gameEvents)
      .where(and(eq(gameEvents.matchId, matchId), eq(gameEvents.type, "PlayerKilled" satisfies GameEventType)));
    if (row?.id != null) {
      firstKillEventIdByMatch.set(matchId, row.id);
    }
  }

  const matchCompletions: XpTransactionContext["matchCompletions"] = new Map();
  const hasMatchEnded = recordedEvents.some((event) => event.type === "MatchEnded");
  if (hasMatchEnded && closedMatch) {
    const participants = await tx
      .select({ steamId: playerMatchStats.steamId, faction: playerMatchStats.faction })
      .from(playerMatchStats)
      .where(eq(playerMatchStats.matchId, closedMatch.id));
    matchCompletions.set(closedMatch.id, { winningFaction: closedMatch.winner, participants });
  }

  return { serverId, xpRewards: rewards, firstKillEventIdByMatch, matchCompletions };
}

/**
 * Persists a batch of XpTransactionDrafts to the xp_transactions ledger and
 * rolls each actually-inserted amount into playerCareerStats.xp. The
 * insert's (event_id, reason, steam_id) uniqueness is what makes a draft
 * idempotent: persisting the same draft twice (e.g. a reprocessed
 * GameEvent) inserts nothing the second time, via onConflictDoNothing, so
 * the returning() rows - and thus the xp increment - only ever reflect
 * genuinely new transactions. steam_id is part of that key (not just
 * event_id+reason) because a single MatchEnded event fans out
 * match_completed/match_win to every participant under one eventId - see
 * xpTransactions' own doc comment in schema.ts. Uses a plain UPDATE rather
 * than an upsert: every reason here fires only after a step that already
 * guarantees the target playerCareerStats row exists (applyKillStreakUpdates
 * for kill/first_blood/streak reasons, closeMatch for
 * match_completed/match_win), unlike applyKillStreakUpdates itself. Returns
 * the actually-inserted transactions for the caller to log once the
 * enclosing transaction has committed.
 */
export async function applyXpTransactionDrafts(
  tx: Tx,
  drafts: XpTransactionDraft[],
): Promise<XpTransactionDraft[]> {
  if (drafts.length === 0) {
    return [];
  }

  const inserted = await tx
    .insert(xpTransactions)
    .values(drafts)
    .onConflictDoNothing({ target: [xpTransactions.eventId, xpTransactions.reason, xpTransactions.steamId] })
    .returning({
      serverId: xpTransactions.serverId,
      steamId: xpTransactions.steamId,
      amount: xpTransactions.amount,
      reason: xpTransactions.reason,
      eventId: xpTransactions.eventId,
    });

  for (const transaction of inserted) {
    await tx
      .update(playerCareerStats)
      .set({ xp: sql`${playerCareerStats.xp} + ${transaction.amount}` })
      .where(
        and(
          eq(playerCareerStats.serverId, transaction.serverId),
          eq(playerCareerStats.steamId, transaction.steamId),
        ),
      );
  }

  return inserted;
}

/**
 * For every steamId in `steamIds` (the players who just received new XP this
 * poll - see ingestSnapshot's recordedXpTransactions), checks whether their
 * resulting cached playerCareerStats.xp now maps to a higher level (per
 * level_thresholds) than what's currently persisted in that row's `level`
 * column, and if so persists the new level and returns one PlayerLevelUp
 * GameEvent draft per level gained (see level-engine.ts's levelUpEvents) - so
 * a single award crossing two thresholds at once still emits one event per
 * level, not one for the whole jump. Reads the pre-update `level` column as
 * each crossing's baseline rather than recomputing it from a "previous xp"
 * value, since that column is kept in sync with xp after every prior award
 * (this function's own postcondition) - so it's always already correct going
 * into this call. `context.matchId` attributes every resulting draft to
 * whichever Match is open at the moment this batch is processed - level is a
 * Server-scoped total, not a Match-scoped one, so the required `matchId`
 * column just needs *a* value (see level-engine.ts's own doc comment).
 */
async function applyLevelUps(
  tx: Tx,
  context: GameEventContext,
  steamIds: string[],
): Promise<GameEventDraft[]> {
  if (steamIds.length === 0) {
    return [];
  }

  const thresholds = await tx.select().from(levelThresholds);
  const careerRows = await tx
    .select({ steamId: playerCareerStats.steamId, xp: playerCareerStats.xp, level: playerCareerStats.level })
    .from(playerCareerStats)
    .where(and(eq(playerCareerStats.serverId, context.serverId), inArray(playerCareerStats.steamId, steamIds)));

  const drafts: GameEventDraft[] = [];
  for (const row of careerRows) {
    const newLevel = levelForXp(row.xp, thresholds);
    if (newLevel === row.level) {
      continue;
    }

    await tx
      .update(playerCareerStats)
      .set({ level: newLevel })
      .where(and(eq(playerCareerStats.serverId, context.serverId), eq(playerCareerStats.steamId, row.steamId)));

    drafts.push(...levelUpEvents(row.steamId, row.level, newLevel, context));
  }

  return drafts;
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
 * Whenever this batch's GameEvents earn XP (via computeXpTransactionDrafts/
 * applyXpTransactionDrafts), every player who actually gained XP is then
 * checked against the level curve - see applyLevelUps - and a PlayerLevelUp
 * GameEvent is emitted per level gained, persisted in a second insert into
 * gameEvents once the resulting playerCareerStats.xp is known.
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
  let closedMatch: (MatchCloseSummary & { id: number; endedAt: Date }) | undefined;
  let openedMatch: { id: number; map: string } | undefined;
  let recordedEvents: RecordedGameEvent[] = [];
  let recordedXpTransactions: XpTransactionDraft[] = [];

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

    recordedEvents = await insertGameEventDrafts(tx, eventDrafts);

    if (recordedEvents.length > 0) {
      const xpTransactionContext = await buildXpTransactionContext(tx, serverId, recordedEvents, closedMatch);
      const xpTransactionDrafts = computeXpTransactionDrafts(recordedEvents, xpTransactionContext);
      recordedXpTransactions = await applyXpTransactionDrafts(tx, xpTransactionDrafts);
    }

    if (recordedXpTransactions.length > 0) {
      const gainedSteamIds = [...new Set(recordedXpTransactions.map((transaction) => transaction.steamId))];
      const levelUpDrafts = await applyLevelUps(
        tx,
        { serverId, matchId: currentMatchId, timestamp: capturedAt, sourceSnapshotId: insertedSnapshot.id },
        gainedSteamIds,
      );

      const recordedLevelUps = await insertGameEventDrafts(tx, levelUpDrafts);
      recordedEvents = recordedEvents.concat(recordedLevelUps);
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
      `[worker] match closed: matchId=${closedMatch.id}, winner=${closedMatch.winner ?? "none"}, mvp=${closedMatch.mvpPlayerSteamId ?? "none"}, ${closedMatch.playerCount} player(s)`,
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
  for (const transaction of recordedXpTransactions) {
    console.log(
      `[worker] xp transaction: reason=${transaction.reason}, amount=${transaction.amount}, serverId=${serverId}, steamId=${transaction.steamId}, eventId=${transaction.eventId}`,
    );
  }
}
