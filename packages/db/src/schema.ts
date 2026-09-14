import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import type { GameEventType } from "./game-event";
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
// when the Match closes (the Faction with the highest score in its final
// Snapshot) - null for a still-open Match, and for any Match closed before
// this column existed.
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
  (table) => [primaryKey({ columns: [table.serverId, table.steamId] })],
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
// steam_id) triple is what makes an award idempotent: reprocessing the same
// GameEvent (e.g. after a retry) can never insert a second row for the same
// reason to the same player, so playerCareerStats.xp - a cached sum of this
// ledger, kept only for fast leaderboard reads - never double-counts.
// steam_id is part of the key (not just event_id+reason) because a single
// Match-scoped event - MatchEnded - fans out match_completed/match_win to
// every participant under that one eventId, so eventId+reason alone would
// collide across players. eventId is a real foreign key (unlike
// gameEvents.sourceSnapshotId's pointer into the ephemeral matchSnapshots
// table): a GameEvent row is permanent, so an XpTransaction can safely
// outlive it by reference.
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.eventId, table.reason, table.steamId)],
);
