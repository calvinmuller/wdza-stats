import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { Snapshot } from "./snapshot";
import type { SteamAchievementUnlock, SteamProfileStatus } from "./steam-profile";

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

// Derived rollup of playerMatchStats, keyed by steamId + Server.
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
