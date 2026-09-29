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

function request(query = "") {
  return new Request(`http://test/api/live-kills${query}`);
}

describe("GET /api/live-kills", () => {
  it("returns 404 when the configured Server is not known", async () => {
    const response = await GET(request());

    expect(response.status).toBe(404);
  });

  it("returns the configured Server's last 20 Kills, oldest first", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();
    await seedKills(server.id, 25);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.kills).toHaveLength(20);
    expect(body.kills[0].victimName).toBe("Victim 6");
    expect(body.kills[19].victimName).toBe("Victim 25");
  });

  it("returns the same Kills newest first with ?order=desc", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();
    await seedKills(server.id, 25);

    const body = await (await GET(request("?order=desc"))).json();

    expect(body.kills).toHaveLength(20);
    expect(body.kills[0].victimName).toBe("Victim 25");
    expect(body.kills[19].victimName).toBe("Victim 6");
  });

  it("steps back through older Kills with ?page=", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();
    await seedKills(server.id, 25);

    const first = await (await GET(request())).json();
    expect(first).toMatchObject({ page: 1, pageSize: 20, totalCount: 25, totalPages: 2 });

    const second = await (await GET(request("?page=2"))).json();
    expect(second.page).toBe(2);
    expect(second.kills.map((kill: { victimName: string }) => kill.victimName)).toEqual([
      "Victim 1",
      "Victim 2",
      "Victim 3",
      "Victim 4",
      "Victim 5",
    ]);

    const secondDesc = await (await GET(request("?page=2&order=desc"))).json();
    expect(secondDesc.kills[0].victimName).toBe("Victim 5");

    const pastEnd = await (await GET(request("?page=3"))).json();
    expect(pastEnd.kills).toEqual([]);
  });

  it("falls back to page 1 for a malformed page", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();
    await seedKills(server.id, 3);

    const body = await (await GET(request("?page=abc"))).json();

    expect(body.page).toBe(1);
    expect(body.kills).toHaveLength(3);
  });

  it("returns an empty list for a Server with no Kills yet", async () => {
    await db.insert(servers).values({ name: "WDZA Test", baseUrl: BASE_URL });

    const body = await (await GET(request())).json();

    expect(body.kills).toEqual([]);
  });
});
