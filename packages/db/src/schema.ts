import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
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
import type { KickVoteStatus } from "./kick-vote";
import { STAFF_ROLES, type StaffAction, type StaffRole } from "./staff";
import type { SteamAchievementUnlock, SteamProfileStatus } from "./steam-profile";
import type { XpReason } from "./xp";

// Domain terms (Server, Match, PlayerMatchStat, PlayerCareerStat, Snapshot) are defined in CONTEXT.md.

export const servers = pgTable("servers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull().unique(),
  // SHA-256 of the Server's kill feed token; the plaintext is shown once at
  // generation and never stored. Null: this Server has no feed configured.
  feedTokenHash: text("feed_token_hash").unique(),
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
    // Whether this player was already on the server for the Match's very
    // first Snapshot, rather than joining partway through - see
    // computePlayerDeltas' presentAtStart doc comment in match-tracker.ts.
    // Used to keep the "survivor" Achievement from unlocking for someone who
    // only joined near the end of the Match with a trivial 0/0 kills/deaths
    // delta.
    presentAtStart: boolean("present_at_start").notNull().default(true),
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
  // ISO 3166-1 alpha-2 (e.g. "ZA") from GetPlayerSummaries' loccountrycode -
  // null if the profile is private or hasn't set a location.
  countryCode: text("country_code"),
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

// BannedPlayer: a steamId the admin has chosen to ignore entirely, keyed by
// steamId alone (like SteamProfile) rather than per-Server, since a banned
// cheater/griefer is banned everywhere they show up, not just on the Server
// the admin happened to be looking at. The Worker filters a banned steamId
// out of every Snapshot before it's diffed or persisted (see
// apps/worker/src/match-tracker.ts's ingestSnapshot), so a banned player
// accrues no further PlayerMatchStat/PlayerCareerStat/XP/GameEvent/
// Notification activity and never appears in the live Snapshot - the same
// choke point that also keeps them out of every public read (leaderboard,
// rankings, player search/profile) built from those tables. Already-recorded
// history from before the ban stays in place; banning only stops future
// updates and future visibility, it doesn't retroactively purge the past.
export const bannedPlayers = pgTable("banned_players", {
  steamId: text("steam_id").primaryKey(),
  reason: text("reason"),
  bannedAt: timestamp("banned_at", { withTimezone: true }).notNull().defaultNow(),
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

// Kill: one killing reported directly by the game's kill feed (see CONTEXT.md).
// steamIds and matchRow carry no foreign keys, matching the convention on
// matches/playerMatchStats: a Kill must outlive whatever it points at, and a
// player may have no PlayerCareerStat row yet. id is the monotonic cursor the
// live stream uses for Last-Event-ID replay. gameMatchId/instanceId are the
// game's own per-boot ids, NOT a Match; matchRow is the Match open on this
// Server when the Kill arrived (null if none). Factions are snapshotted from
// the latest Snapshot at receipt (null when unknown).
export const kills = pgTable(
  "kills",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    serverId: integer("server_id")
      .notNull()
      .references(() => servers.id),
    eventId: text("event_id").notNull(),
    instanceId: text("instance_id").notNull(),
    gameMatchId: text("game_match_id").notNull(),
    matchRow: integer("match_row"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    // Seconds on the game's match clock.
    eventTime: real("event_time").notNull(),
    map: text("map").notNull(),
    // Null killer: a death by the environment.
    killerSteamId: text("killer_steam_id"),
    killerName: text("killer_name"),
    killerFaction: text("killer_faction"),
    victimSteamId: text("victim_steam_id").notNull(),
    victimName: text("victim_name").notNull(),
    victimFaction: text("victim_faction"),
    // The raw weapon or vehicle tag, e.g. Id.Item.AK74M.
    cause: text("cause"),
    distanceM: real("distance_m"),
    headshot: boolean("headshot").notNull().default(false),
    suicide: boolean("suicide").notNull().default(false),
    // The other context tags, short form (Penetration, RoadKill, Falling, ...).
    tags: jsonb("tags").notNull().$type<string[]>(),
  },
  (table) => [
    unique("kills_server_event_unique").on(table.serverId, table.eventId),
    index("kills_killer_idx").on(table.killerSteamId),
    index("kills_victim_idx").on(table.victimSteamId),
  ],
);

// Staff Members sign in with email and password through Better Auth. The four
// tables below are Better Auth's core schema under our own names: "user" is
// staffMembers, "account" is staffCredentials (the email+password credential
// lives on its `password` column), "session" and "verification" keep their
// meaning. No email is ever sent, so `emailVerified` stays false and
// staffVerifications is unused today; it exists because the library expects it.
// Ids are text because Better Auth generates them.
export const staffMembers = pgTable(
  "staff_members",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: text("role").$type<StaffRole>().notNull(),
    // Set when an admin has chosen this Staff Member's password (a temporary
    // one): they must pick their own before doing anything else.
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    // The Staff Member's own steamId, linked only by them completing Steam
    // sign-in (docs/adr/0007) - never typed in. A linked steamId can never be
    // a KickVote's target. Not a Verified Player: the two identities stay
    // separate even for the same human. Unknown to Better Auth, which leaves it alone.
    steamId: text("steam_id").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "staff_members_role_check",
      sql`${table.role} in (${sql.raw(STAFF_ROLES.map((r) => `'${r}'`).join(", "))})`,
    ),
  ],
);

export const staffSessions = pgTable(
  "staff_sessions",
  {
    id: text("id").primaryKey(),
    staffMemberId: text("staff_member_id")
      .notNull()
      .references(() => staffMembers.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("staff_sessions_staff_member_idx").on(table.staffMemberId)],
);

export const staffCredentials = pgTable(
  "staff_credentials",
  {
    id: text("id").primaryKey(),
    staffMemberId: text("staff_member_id")
      .notNull()
      .references(() => staffMembers.id, { onDelete: "cascade" }),
    // Better Auth's account id and provider id; "credential" for email+password.
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    // scrypt hash, never the plaintext.
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("staff_credentials_staff_member_idx").on(table.staffMemberId)],
);

export const staffVerifications = pgTable(
  "staff_verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("staff_verifications_identifier_idx").on(table.identifier)],
);

// Append-only record of who did what in the admin area. The actor's id and email
// are copied in and deliberately not a foreign key: the trail must outlive a
// removed Staff Member. A null staffMemberId means the bootstrap page, which is
// gated by the secret and has no signed-in person. Never store a password or a
// token in `detail`.
export const staffAuditLog = pgTable(
  "staff_audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    staffMemberId: text("staff_member_id"),
    actorEmail: text("actor_email").notNull(),
    action: text("action").$type<StaffAction>().notNull(),
    // What it was done to: a steamId, a config row key, a Staff Member id.
    target: text("target"),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("staff_audit_log_created_idx").on(table.createdAt)],
);

// The KICK_VOTE_SETTINGS config table: a singleton row (id always 1), matching
// notificationSettings/mvpFormulaWeights' own config-table precedent.
// thresholdBallots/durationSeconds/initiatorCooldownSeconds are read fresh
// when a KickVote starts and snapshotted onto that row (see kickVotes.threshold
// and .durationSeconds below) so a mid-vote settings change never alters a
// vote already in flight.
export const kickVoteSettings = pgTable("kick_vote_settings", {
  id: integer("id").primaryKey(),
  thresholdBallots: integer("threshold_ballots").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  initiatorCooldownSeconds: integer("initiator_cooldown_seconds").notNull(),
});

// KickVote: a Server-scoped campaign to force a disruptive player off - see
// CONTEXT.md and kick-vote.ts. targetSteamId is not a foreign key (matching
// bannedPlayers/kills' own convention): the target need not have a
// PlayerCareerStat row. targetName is captured at initiation, from the same
// Snapshot the initiator picked the target out of, so the /kick/{id} page and
// the in-game broadcast can still show a name after the target leaves and
// drops out of the live Snapshot (see status "targetLeft"). threshold and
// durationSeconds are snapshotted from kickVoteSettings at startedAt, not
// read live, for the reason given on that table. endsAt is the derived
// startedAt + durationSeconds, stored rather than computed on every read
// since it's what the worker's expiry sweep and the /kick/{id} page's
// countdown both query against. resolvedAt is null only while status is
// "active". cancelledByStaffMemberId is set only for status "staffCancelled"
// (see staff.ts's "cancel_kick_vote" STAFF_ACTIONS entry, which is the
// audit-log record of the same action - this column is for the read path,
// not a replacement for that log).
export const kickVotes = pgTable(
  "kick_votes",
  {
    id: serial("id").primaryKey(),
    serverId: integer("server_id")
      .notNull()
      .references(() => servers.id),
    targetSteamId: text("target_steam_id").notNull(),
    targetName: text("target_name").notNull(),
    reason: text("reason").notNull(),
    // Who started it: the Verified Player's steamId (docs/adr/0007), shown only
    // to Staff Members and keying the start cooldown. initiatorSessionId is the
    // anonymous visitor session that started a KickVote before Steam sign-in
    // existed; it is only ever set on those older rows, which have no steamId.
    initiatorSteamId: text("initiator_steam_id"),
    initiatorSessionId: text("initiator_session_id"),
    threshold: integer("threshold").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().$type<KickVoteStatus>().default("active"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    cancelledByStaffMemberId: text("cancelled_by_staff_member_id").references(() => staffMembers.id),
  },
  (table) => [
    uniqueIndex("kick_votes_one_active_per_server_idx")
      .on(table.serverId)
      .where(sql`${table.status} = 'active'`),
    index("kick_votes_initiator_steam_id_idx").on(table.initiatorSteamId, table.startedAt),
  ],
);

// KickVoteBallot: one browser session's vote toward one KickVote - see
// CONTEXT.md. The (kick_vote_id, session_id) primary key is what makes a
// second vote from the same session a no-op rather than a second Ballot
// (mirroring playerAchievements' composite-key idempotency), and is also the
// enforcement mechanism for "no retraction": there is no delete path, only
// insert-if-absent.
export const kickVoteBallots = pgTable(
  "kick_vote_ballots",
  {
    kickVoteId: integer("kick_vote_id")
      .notNull()
      .references(() => kickVotes.id),
    sessionId: text("session_id").notNull(),
    castAt: timestamp("cast_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.kickVoteId, table.sessionId] })],
);

// Verified Player: a person who has proven, by signing in with Steam, that
// they own this steamId - see CONTEXT.md and docs/adr/0007. The first sign-in
// creates the row, and that is the claim; there is no separate step. Keyed by
// steamId alone (like steamProfiles and bannedPlayers): owning a steamId isn't
// per-Server. Deliberately unrelated to staffMembers - the same human can be
// both, as two separate identities.
export const verifiedPlayers = pgTable("verified_players", {
  steamId: text("steam_id").primaryKey(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
  lastSignedInAt: timestamp("last_signed_in_at", { withTimezone: true }).notNull().defaultNow(),
});

// One Verified Player's signed-in browser. Only a SHA-256 hash of the cookie's
// token is stored, so a leaked row can't be replayed as a cookie. Separate from
// staffSessions (Better Auth) and from the anonymous visitor-session cookie
// behind KickVoteBallots.
export const verifiedPlayerSessions = pgTable(
  "verified_player_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    steamId: text("steam_id")
      .notNull()
      .references(() => verifiedPlayers.steamId, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("verified_player_sessions_steam_id_idx").on(table.steamId)],
);
