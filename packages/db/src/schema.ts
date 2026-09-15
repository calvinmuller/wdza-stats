import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AchievementTrigger } from "./achievement";
import type { ChallengeScope, ChallengeType } from "./challenge";
import type { GameEventType } from "./game-event";
import type { NotificationKind, NotificationPriority } from "./notification";
import type { Snapshot } from "./snapshot";
import type { SteamAchievementUnlock, SteamProfileStatus } from "./steam-profile";
import type { XpReason } from "./xp";

// Domain terms (Server, Match, PlayerMatchStat, PlayerCareerStat, Snapshot) are defined in CONTEXT.md.

export const servers = pgTable("servers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull().unique(),
});

// The most recent Snapshot per Server, overwritten in place on every poll.
// Current-state data, not history - closed Matches are the historical record.
export const latestSnapshots = pgTable("latest_snapshots", {
  serverId: integer("server_id")
    .primaryKey()
    .references(() => servers.id),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  payload: jsonb("payload").notNull().$type<Snapshot>(),
});

// endedAt is null while the Match is still open. winningFaction is set only
// when the Match closes (the sole Faction with a strictly-higher score than
// every other in its final Snapshot, per the same strict-overtake rule as
// FactionTookLead - see match-tracker.ts's winningFaction) - null for a
// still-open Match, a Match that closed tied, and any Match closed before
// this column existed. mvpPlayerSteamId/mvpScore are likewise set only on
// close, from the config-driven formula in mvpFormulaWeights - null under
// the same conditions plus a Match that closed with no participants.
// steamId isn't a foreign key here (nor anywhere else a GameEvent or
// PlayerMatchStat references one): playerCareerStats' key is a
// (serverId, steamId) pair, not steamId alone.
export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id")
    .notNull()
    .references(() => servers.id),
  map: text("map").notNull(),
  experiences: text("experiences").array().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  winningFaction: text("winning_faction"),
  mvpPlayerSteamId: text("mvp_player_steam_id"),
  mvpScore: integer("mvp_score"),
});

// Raw Snapshots belonging to the currently-open Match, kept only long enough
// to compute that Match's PlayerMatchStat deltas on close, then deleted -
// history lives on in matches/playerMatchStats/playerCareerStats, not here.
export const matchSnapshots = pgTable("match_snapshots", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id")
    .notNull()
    .references(() => matches.id),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  payload: jsonb("payload").notNull().$type<Snapshot>(),
});

export const playerMatchStats = pgTable(
  "player_match_stats",
  {
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id),
    steamId: text("steam_id").notNull(),
    faction: text("faction").notNull(),
    kills: integer("kills").notNull(),
    deaths: integer("deaths").notNull(),
    cash: integer("cash").notNull(),
  },
  (table) => [primaryKey({ columns: [table.matchId, table.steamId] })],
);

// Derived rollup of playerMatchStats, keyed by steamId + Server. Also carries
// the gamification totals we invent ourselves (xp, level, streaks, MVP
// count, win/loss) - see CONTEXT.md's PlayerCareerStat entry. `level`
// defaults to 1 to match the level curve's floor (0 XP = level 1).
export const playerCareerStats = pgTable(
  "player_career_stats",
  {
    serverId: integer("server_id")
      .notNull()
      .references(() => servers.id),
    steamId: text("steam_id").notNull(),
    displayName: text("display_name").notNull(),
    kills: integer("kills").notNull().default(0),
    deaths: integer("deaths").notNull().default(0),
    cash: integer("cash").notNull().default(0),
    matchesPlayed: integer("matches_played").notNull().default(0),
    xp: integer("xp").notNull().default(0),
    level: integer("level").notNull().default(1),
    matchesWon: integer("matches_won").notNull().default(0),
    matchesLost: integer("matches_lost").notNull().default(0),
    highestKillStreak: integer("highest_kill_streak").notNull().default(0),
    currentKillStreak: integer("current_kill_streak").notNull().default(0),
    mvpCount: integer("mvp_count").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.serverId, table.steamId] }),
    // One index per gamification rankings sort column (ticket 11) so
    // paginated ORDER BY ... LIMIT queries don't degrade as rows grow.
    index("player_career_stats_server_xp_idx").on(table.serverId, table.xp),
    index("player_career_stats_server_kills_idx").on(table.serverId, table.kills),
    index("player_career_stats_server_wins_idx").on(table.serverId, table.matchesWon),
    index("player_career_stats_server_streak_idx").on(
      table.serverId,
      table.highestKillStreak,
    ),
  ],
);

// A player's Steam Web API identity/achievement data, keyed by steamId
// alone - not scoped per-Server, since it's a property of the Steam
// account, not of any one Server (docs/adr/0002). personaName/avatarUrl are
// nullable since the summaries fetch can fail independently of the
// achievements fetch (see SteamProfileStatus).
export const steamProfiles = pgTable("steam_profiles", {
  steamId: text("steam_id").primaryKey(),
  personaName: text("persona_name"),
  avatarUrl: text("avatar_url"),
  achievements: jsonb("achievements")
    .notNull()
    .$type<SteamAchievementUnlock[]>(),
  // Lifetime WARDOGS playtime in minutes (GetOwnedGames' playtime_forever).
  // Null means "not fetched yet" or "private game details", not "zero" -
  // same private/unknown ambiguity as achievements, but tracked separately
  // since the two fetches can succeed or fail independently.
  playtimeMinutes: integer("playtime_minutes"),
  status: text("status").notNull().$type<SteamProfileStatus>(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});

// The WARDOGS achievement schema (name/description/icon per achievement) -
// global, developer-defined metadata, not per-player. Fetched once and
// refreshed rarely, independent of any player's SteamProfile.
export const steamAchievementSchema = pgTable(
  "steam_achievement_schema",
  {
    appId: integer("app_id").notNull(),
    apiName: text("api_name").notNull(),
    displayName: text("display_name").notNull(),
    description: text("description"),
    iconUrl: text("icon_url").notNull(),
  },
  (table) => [primaryKey({ columns: [table.appId, table.apiName] })],
);

// GameEvent: a domain-level occurrence inferred by diffing two consecutive
// Snapshots for one player or Match - see CONTEXT.md. The permanent,
// idempotent log every gamification engine (XP, Challenge, Achievement,
// Notification) reads from; never bypassed by those engines calling RCON or
// Snapshot data directly. targetSteamId is never populated in v1 (no safe
// kill/death attribution within a poll window) but the column exists so
// later event types have a home for it without another migration.
// sourceSnapshotId points at the matchSnapshots row the event was inferred
// from, but isn't a foreign key: that row is deleted once its Match closes,
// while the GameEvent it produced must outlive it. idempotencyKey is a
// deterministic string derived from the event's own identity (Server,
// Match, type, steamId, timestamp) so re-processing the same Snapshot
// comparison - e.g. after a retry - never inserts a duplicate row.
export const gameEvents = pgTable("game_events", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id")
    .notNull()
    .references(() => servers.id),
  matchId: integer("match_id")
    .notNull()
    .references(() => matches.id),
  type: text("type").notNull().$type<GameEventType>(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  // Nullable: MatchStarted/MatchEnded are Match-scoped, not player-scoped.
  steamId: text("steam_id"),
  targetSteamId: text("target_steam_id"),
  faction: text("faction"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  sourceSnapshotId: integer("source_snapshot_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
});

// The XP_REWARDS config table: the amount awarded per XpReason, seeded with
// the spec's defaults in this table's own migration - see CONTEXT.md's
// XpTransaction entry. Read by the Progression Engine rather than inlining
// amounts in application code, so rewards can be retuned without a deploy.
export const xpRewards = pgTable("xp_rewards", {
  reason: text("reason").primaryKey().$type<XpReason>(),
  amount: integer("amount").notNull(),
});

// XpTransaction: an immutable ledger entry recording one award of XP to a
// player for one GameEvent - see CONTEXT.md. The unique (event_id, reason,
// steam_id) index is what makes every non-Challenge award idempotent:
// reprocessing the same GameEvent (e.g. after a retry) can never insert a
// second row for the same reason to the same player, so
// playerCareerStats.xp - a cached sum of this ledger, kept only for fast
// leaderboard reads - never double-counts. steam_id is part of the key (not
// just event_id+reason) because a single Match-scoped event - MatchEnded -
// fans out match_completed/match_win to every participant under that one
// eventId, so eventId+reason alone would collide across players. eventId is
// a real foreign key (unlike gameEvents.sourceSnapshotId's pointer into the
// ephemeral matchSnapshots table): a GameEvent row is permanent, so an
// XpTransaction can safely outlive it by reference.
//
// "challenge_completed" (see xp.ts) is carved out into its own *partial*
// unique index on (event_id, steam_id, challenge_instance_id), rather than
// folded into the index above, for two reasons: challenge_instance_id is
// null for every other reason, and Postgres never treats two nulls as equal
// for uniqueness - so a shared index would silently let the same non-Challenge
// GameEvent+reason+player combination be inserted twice (defeating the very
// idempotency this index exists for), which is exactly what a bare extra
// nullable column in one shared constraint would cause. Scoping the second
// index to `reason = 'challenge_completed'` (where challenge_instance_id is
// always populated - see applyChallengeProgressUpdates in match-tracker.ts)
// is what lets a single qualifying GameEvent complete *two* different
// ChallengeInstances for the same player at once (e.g. one PlayerKilled
// event crossing both a "kills" and a "kills_in_match" target) and award XP
// for both, while every other reason keeps the exact idempotency behavior it
// had before Challenges existed.
export const xpTransactions = pgTable(
  "xp_transactions",
  {
    id: serial("id").primaryKey(),
    serverId: integer("server_id")
      .notNull()
      .references(() => servers.id),
    steamId: text("steam_id").notNull(),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull().$type<XpReason>(),
    eventId: integer("event_id")
      .notNull()
      .references(() => gameEvents.id),
    challengeInstanceId: integer("challenge_instance_id").references(() => challengeInstances.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("xp_transactions_event_reason_steam_idx")
      .on(table.eventId, table.reason, table.steamId)
      .where(sql`${table.reason} <> 'challenge_completed'`),
    uniqueIndex("xp_transactions_challenge_completion_idx")
      .on(table.eventId, table.steamId, table.challengeInstanceId)
      .where(sql`${table.reason} = 'challenge_completed'`),
  ],
);

// The level curve config table: the cumulative XP required to reach each
// level, seeded in this table's own migration with the spec's stated
// defaults (0/1,000/2,500/4,500 for levels 1-4) extended further by the same
// quadratic pattern - see the migration's own comment for the formula. Read
// by the Progression Engine (packages/db/src/level.ts) instead of a
// hardcoded per-level formula/switch in application code, so the curve can
// be retuned or extended (raising the level cap) without a deploy.
export const levelThresholds = pgTable("level_thresholds", {
  level: integer("level").primaryKey(),
  xpRequired: integer("xp_required").notNull(),
});

// The MVP formula config table: the per-kill/per-death weight the Match
// Finalization step (apps/worker/src/mvp-engine.ts) sums to score each of a
// closed Match's participants, seeded with the spec's stated default
// (kills x10 - deaths x5, i.e. ("kills", 10) and ("deaths", -5)) - see
// ticket 07 and spec.md's Domain Decisions. Read fresh on every Match close
// rather than hardcoded, so the formula can be retuned without a deploy,
// matching xpRewards/levelThresholds' own config-table precedent.
export const mvpFormulaWeights = pgTable("mvp_formula_weights", {
  component: text("component").primaryKey().$type<"kills" | "deaths">(),
  weight: integer("weight").notNull(),
});

// The 7 initial Achievements' data - name/description plus the
// trigger/threshold pair apps/worker/src/achievement-engine.ts checks each
// relevant GameEvent's observed counter against, seeded in this table's own
// migration - see CONTEXT.md's Achievement entry and ticket 08. Config-driven
// rather than one-off per-achievement conditionals scattered through event
// handlers, matching xpRewards/levelThresholds/mvpFormulaWeights' own
// config-table precedent.
export const achievementDefinitions = pgTable("achievement_definitions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  trigger: text("trigger").notNull().$type<AchievementTrigger>(),
  threshold: integer("threshold").notNull(),
});

// PlayerAchievement: an Achievement a player has unlocked - see CONTEXT.md.
// The (server_id, steam_id, achievement_id) primary key is what makes an
// unlock idempotent: a player meeting the same qualifying condition again
// later, or the same triggering GameEvent being reprocessed, can never insert
// a second row, so AchievementUnlocked fires at most once per triple -
// mirroring xpTransactions' own uniqueness role for XP awards.
export const playerAchievements = pgTable(
  "player_achievements",
  {
    serverId: integer("server_id")
      .notNull()
      .references(() => servers.id),
    steamId: text("steam_id").notNull(),
    achievementId: text("achievement_id")
      .notNull()
      .references(() => achievementDefinitions.id),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.serverId, table.steamId, table.achievementId] })],
);

// ChallengeDefinition: static configuration for one kind of Challenge - see
// CONTEXT.md's Challenge entry and challenge.ts's ChallengeType doc comment
// for what each `type` measures. `scope` supports "daily" today, with room
// for "weekly"/"season"/"server" later without a schema change (ticket 09).
// `xpReward` is this definition's own configured award, read directly by
// apps/worker/src/challenge-engine.ts rather than through the xp_rewards
// table - a Challenge's payout is part of its own definition, unlike the
// fixed-per-GameEvent-type rewards in xp_rewards.
export const challengeDefinitions = pgTable("challenge_definitions", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().$type<ChallengeType>(),
  scope: text("scope").notNull().$type<ChallengeScope>(),
  target: integer("target").notNull(),
  xpReward: integer("xp_reward").notNull(),
});

// ChallengeInstance: one active occurrence of a ChallengeDefinition for a
// given Server and period - e.g. today's "get 15 kills" instance on Server 1.
// `periodKey` is a deterministic string identifying the instance's period
// (today's UTC date as YYYY-MM-DD for the "daily" scope - see
// apps/worker/src/challenge-engine.ts's dailyPeriodKey) rather than a
// startAt/endAt pair, so generation can be checked idempotently: the unique
// (definition_id, server_id, period_key) triple is what makes generating
// today's instances safe to run more than once (even concurrently from a
// future second worker instance) - a duplicate generation attempt simply
// finds nothing new to insert, mirroring gameEvents.idempotencyKey's role.
export const challengeInstances = pgTable(
  "challenge_instances",
  {
    id: serial("id").primaryKey(),
    definitionId: integer("definition_id")
      .notNull()
      .references(() => challengeDefinitions.id),
    serverId: integer("server_id")
      .notNull()
      .references(() => servers.id),
    periodKey: text("period_key").notNull(),
  },
  (table) => [unique().on(table.definitionId, table.serverId, table.periodKey)],
);

// PlayerChallengeProgress: one player's running progress toward one active
// ChallengeInstance, tracked separately per player per instance so
// concurrent Challenges never interfere with each other's counts (see
// CONTEXT.md's Challenge entry). `progress` is always the instance's current
// absolute measurement (not a delta) - for an "increment" type
// (kills/wins/matches_played) that's a running total; for a "watermark" type
// (kill_streak/kills_in_match/kills_without_dying) it's the highest value
// reached so far, which never decreases even after the underlying live value
// (e.g. a kill streak) resets - see challenge-engine.ts.
export const playerChallengeProgress = pgTable(
  "player_challenge_progress",
  {
    instanceId: integer("instance_id")
      .notNull()
      .references(() => challengeInstances.id),
    steamId: text("steam_id").notNull(),
    progress: integer("progress").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.instanceId, table.steamId] })],
);

// ChallengeCompletion: records that a player reached one ChallengeInstance's
// target - see CONTEXT.md's Challenge entry. The (instance_id, steam_id)
// primary key is what makes completion idempotent: reaching (or re-crossing)
// the target again later, or the same triggering GameEvent being
// reprocessed, can never insert a second row, so the XP award it triggers
// (an xp_transactions row with reason "challenge_completed") only ever fires
// once per player per instance - mirroring playerAchievements' own
// uniqueness role for Achievement unlocks.
export const challengeCompletions = pgTable(
  "challenge_completions",
  {
    instanceId: integer("instance_id")
      .notNull()
      .references(() => challengeInstances.id),
    steamId: text("steam_id").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.instanceId, table.steamId] })],
);

// The NOTIFICATION_RULES config table: which priority tier and message
// template each NotificationKind (notification.ts) renders under, seeded
// with this table's own migration's defaults - see CONTEXT.md's Notification
// entry and ticket 10. Read fresh by the Notification Engine
// (apps/worker/src/notification-engine.ts) rather than hardcoded, matching
// xpRewards/achievementDefinitions/challengeDefinitions' own config-table
// precedent. `template` uses `{{placeholder}}` substitution - see
// notification-engine.ts's renderTemplate.
export const notificationRules = pgTable("notification_rules", {
  kind: text("kind").primaryKey().$type<NotificationKind>(),
  priority: text("priority").notNull().$type<NotificationPriority>(),
  template: text("template").notNull(),
});

// The NOTIFICATION_SETTINGS config table: a singleton row (id always 1)
// holding the configured max-per-minute cap on low/normal-priority
// Notifications - see ticket 10 and notification-engine.ts's
// applyNotificationThrottle. High-priority Notifications are never subject to
// this cap.
export const notificationSettings = pgTable("notification_settings", {
  id: integer("id").primaryKey(),
  maxLowNormalPerMinute: integer("max_low_normal_per_minute").notNull(),
});

// Notification: a throttled, recorded representation of a noteworthy
// GameEvent or milestone - see CONTEXT.md and notification.ts. `eventId` is a
// real foreign key into gameEvents (mirroring xpTransactions.eventId): for a
// Notification produced by a GameEvent this is that event's own id, and for
// a ChallengeCompleted Notification (which has no GameEventType of its own -
// see notification.ts) it's the triggering GameEvent that completed the
// Challenge, matching xp_transactions' own "challenge_completed" attribution.
// serverId is duplicated from that same GameEvent (also mirroring
// xpTransactions) so the dashboard's recent-events feed can query this table
// directly without a join. `timestamp` is the originating poll's capturedAt
// (context.timestamp, not DB insertion time), so throttling and the feed's
// ordering stay driven by the same clock as every other GameEvent - see
// notification-engine.ts. No uniqueness constraint is needed here: every
// input this table's caller reacts to (a genuinely newly-inserted GameEvent,
// or a genuinely new ChallengeCompletion row) is already deduplicated
// upstream by its own idempotency mechanism, so reprocessing the same poll
// never reaches this insert with the same event twice - mirroring how
// AchievementUnlocked/PlayerLevelUp events themselves rely on
// insertGameEventDrafts' own dedupe rather than a second guard.
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id")
    .notNull()
    .references(() => servers.id),
  priority: text("priority").notNull().$type<NotificationPriority>(),
  message: text("message").notNull(),
  eventId: integer("event_id")
    .notNull()
    .references(() => gameEvents.id),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
});
