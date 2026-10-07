import { bannedPlayers, createDb, type Database } from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const db: Database = createDb(process.env.DATABASE_URL!);

afterEach(async () => {
  await db.delete(bannedPlayers);
});

afterAll(async () => {
  await db.$client.end();
});

describe("GET /api/bans", () => {
  it("returns an empty list when nobody is banned", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ bans: [] });
  });

  it("lists every site and Warcon ban with its reason, ban time, and source, most recent first", async () => {
    await db.insert(bannedPlayers).values([
      { steamId: "1", reason: "Aimbot", bannedAt: new Date("2026-01-01T00:00:00.000Z") },
      { steamId: "2", reason: null, bannedAt: new Date("2026-02-01T00:00:00.000Z"), source: "warcon" },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      bans: [
        { steamId: "2", reason: null, bannedAt: "2026-02-01T00:00:00.000Z", source: "warcon" },
        { steamId: "1", reason: "Aimbot", bannedAt: "2026-01-01T00:00:00.000Z", source: "site" },
      ],
    });
  });
});
