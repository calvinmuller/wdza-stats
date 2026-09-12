import {
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Domain terms (Server, Match, PlayerMatchStat, PlayerCareerStat) are defined in CONTEXT.md.

export const servers = pgTable("servers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull().unique(),
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
