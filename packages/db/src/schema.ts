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

// endedAt is null while the Match is still open.
export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id")
    .notNull()
    .references(() => servers.id),
  map: text("map").notNull(),
  experiences: text("experiences").array().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
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
