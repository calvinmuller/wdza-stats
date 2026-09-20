import { createDb, kills, servers, type Database } from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const db: Database = createDb(process.env.DATABASE_URL!);
const BASE_URL = process.env.RCON_BASE_URL!;

afterEach(async () => {
  await db.delete(kills);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

async function seedKills(serverId: number, count: number) {
  for (let n = 1; n <= count; n++) {
    await db.insert(kills).values({
      serverId,
      eventId: `event-${n}`,
      instanceId: "boot",
      gameMatchId: "game-match",
      eventTime: n,
      map: "Kavkazi",
      victimSteamId: "76561198000000002",
      victimName: `Victim ${n}`,
      tags: [],
    });
  }
}

describe("GET /api/live-kills", () => {
  it("returns 404 when the configured Server is not known", async () => {
    const response = await GET();

    expect(response.status).toBe(404);
  });

  it("returns the configured Server's last 20 Kills, oldest first", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();
    await seedKills(server.id, 25);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.kills).toHaveLength(20);
    expect(body.kills[0].victimName).toBe("Victim 6");
    expect(body.kills[19].victimName).toBe("Victim 25");
  });

  it("returns an empty list for a Server with no Kills yet", async () => {
    await db.insert(servers).values({ name: "WDZA Test", baseUrl: BASE_URL });

    const body = await (await GET()).json();

    expect(body.kills).toEqual([]);
  });
});
