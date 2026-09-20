import { createDb, kills, servers, type Database } from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { getRecentKills } from "./recent-kills";

const db: Database = createDb(process.env.DATABASE_URL!);

afterEach(async () => {
  await db.delete(kills);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

async function seedServer(baseUrl = "http://rcon.test") {
  const [server] = await db
    .insert(servers)
    .values({ name: "WDZA Test", baseUrl })
    .returning();
  return server;
}

// Kills are seeded in order, so a higher id is a later Kill; the victim's name
// carries the sequence number so assertions read as a list of who died.
async function seedKills(serverId: number, count: number, start = 1) {
  for (let n = start; n < start + count; n++) {
    await db.insert(kills).values({
      serverId,
      eventId: `event-${serverId}-${n}`,
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

const victims = (rows: { victimName: string }[]) =>
  rows.map((row) => row.victimName);

describe("getRecentKills", () => {
  it("returns nothing for a Server with no Kills", async () => {
    const server = await seedServer();

    expect(await getRecentKills(db, server.id)).toEqual([]);
  });

  it("returns the latest Kills, oldest first", async () => {
    const server = await seedServer();
    await seedKills(server.id, 5);

    const recent = await getRecentKills(db, server.id, { limit: 3 });

    expect(victims(recent)).toEqual(["Victim 3", "Victim 4", "Victim 5"]);
  });

  it("gives each Kill a strictly increasing id", async () => {
    const server = await seedServer();
    await seedKills(server.id, 3);

    const ids = (await getRecentKills(db, server.id)).map((kill) => kill.id);

    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(3);
  });

  it("returns only Kills after a cursor, oldest first", async () => {
    const server = await seedServer();
    await seedKills(server.id, 5);
    const [, second] = await getRecentKills(db, server.id);

    const after = await getRecentKills(db, server.id, { afterId: second.id });

    expect(victims(after)).toEqual(["Victim 3", "Victim 4", "Victim 5"]);
  });

  it("returns the earliest Kills past a cursor when more than the limit are waiting", async () => {
    const server = await seedServer();
    await seedKills(server.id, 5);
    const [first] = await getRecentKills(db, server.id);

    const after = await getRecentKills(db, server.id, {
      afterId: first.id,
      limit: 2,
    });

    expect(victims(after)).toEqual(["Victim 2", "Victim 3"]);
  });

  it("returns nothing when the cursor is at the newest Kill", async () => {
    const server = await seedServer();
    await seedKills(server.id, 2);
    const recent = await getRecentKills(db, server.id);

    const after = await getRecentKills(db, server.id, {
      afterId: recent[1].id,
    });

    expect(after).toEqual([]);
  });

  it("never returns another Server's Kills", async () => {
    const ours = await seedServer("http://ours.test");
    const theirs = await seedServer("http://theirs.test");
    await seedKills(ours.id, 2);
    await seedKills(theirs.id, 3);

    const recent = await getRecentKills(db, ours.id);
    const after = await getRecentKills(db, ours.id, { afterId: 0 });

    expect(recent).toHaveLength(2);
    expect(after).toHaveLength(2);
  });
});
