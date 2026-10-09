import {
  bannedPlayers,
  createDb,
  playerCareerStats,
  reservedSlots,
  servers,
  steamProfiles,
  type Database,
} from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { listPublicBans, listPublicReservedSlots } from "./public-lists";

const db: Database = createDb(process.env.DATABASE_URL!);

afterEach(async () => {
  await db.delete(bannedPlayers);
  await db.delete(reservedSlots);
  await db.delete(steamProfiles);
  await db.delete(playerCareerStats);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

async function addServer(enabled = true) {
  const [server] = await db
    .insert(servers)
    .values({ name: "WDZA Test", baseUrl: `http://rcon-public-lists-${crypto.randomUUID()}.test:9006`, enabled })
    .returning();
  return server;
}

async function addCareer(serverId: number, steamId: string, displayName: string) {
  await db.insert(playerCareerStats).values({ serverId, steamId, displayName, kills: 0, deaths: 0, cash: 0, matchesPlayed: 1 });
}

async function addSteamProfile(steamId: string, personaName: string) {
  await db.insert(steamProfiles).values({
    steamId,
    personaName,
    avatarUrl: `https://avatars.steamstatic.com/${steamId}.jpg`,
    countryCode: "ZA",
    achievements: [],
    playtimeMinutes: null,
    status: "ok",
    fetchedAt: new Date(),
  });
}

describe("listPublicBans", () => {
  it("lists every ban, newest first, named by Steam persona, else by stats, else not at all", async () => {
    const server = await addServer();
    await addSteamProfile("1", "Persona One");
    await addCareer(server.id, "2", "StatsName");
    await db.insert(bannedPlayers).values([
      { steamId: "1", reason: "Cheating", bannedAt: new Date("2026-03-01T00:00:00Z"), source: "warcon" },
      { steamId: "2", reason: null, bannedAt: new Date("2026-02-01T00:00:00Z") },
      { steamId: "3", reason: "Griefing", bannedAt: new Date("2026-01-01T00:00:00Z") },
    ]);

    expect(await listPublicBans(db)).toEqual([
      {
        steamId: "1",
        name: "Persona One",
        avatarUrl: "https://avatars.steamstatic.com/1.jpg",
        countryCode: "ZA",
        reason: "Cheating",
        bannedAt: new Date("2026-03-01T00:00:00Z"),
        hasStats: false,
      },
      { steamId: "2", name: "StatsName", avatarUrl: null, countryCode: null, reason: null, bannedAt: new Date("2026-02-01T00:00:00Z"), hasStats: false },
      { steamId: "3", name: null, avatarUrl: null, countryCode: null, reason: "Griefing", bannedAt: new Date("2026-01-01T00:00:00Z"), hasStats: false },
    ]);
  });
});

describe("listPublicReservedSlots", () => {
  it("names each slot by Steam persona, else Warcon's name, else stats, sorted by name with nameless ones last", async () => {
    const server = await addServer();
    const disabled = await addServer(false);
    const addedAt = new Date("2026-10-01T00:00:00Z");
    await addSteamProfile("1", "zulu");
    await addCareer(server.id, "1", "ignored");
    await addCareer(server.id, "3", "Bravo");
    await addCareer(disabled.id, "4", "Hidden");
    await db.insert(reservedSlots).values([
      { steamId: "1", name: "WarconName", addedAt },
      { steamId: "2", name: "alpha", addedAt },
      { steamId: "3", name: null, addedAt },
      { steamId: "4", name: null, addedAt },
    ]);

    const slots = await listPublicReservedSlots(db);

    expect(slots.map(({ steamId, name, hasStats }) => ({ steamId, name, hasStats }))).toEqual([
      { steamId: "2", name: "alpha", hasStats: false },
      { steamId: "3", name: "Bravo", hasStats: true },
      { steamId: "1", name: "zulu", hasStats: true },
      { steamId: "4", name: null, hasStats: false },
    ]);
  });
});
