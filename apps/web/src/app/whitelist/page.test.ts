import { createDb, playerCareerStats, reservedSlots, servers, type Database } from "@wdza-stats/db";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import WhitelistPage from "./page";

const db: Database = createDb(process.env.DATABASE_URL!);

afterEach(async () => {
  await db.delete(reservedSlots);
  await db.delete(playerCareerStats);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

describe("WhitelistPage", () => {
  it("says so when nobody has a reserved slot", async () => {
    expect(renderToStaticMarkup(await WhitelistPage())).toContain("Nobody has a reserved slot.");
  });

  it("links a player with stats to their overview, and anyone else to their Steam profile", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: `http://rcon-whitelist-${crypto.randomUUID()}.test:9006` })
      .returning();
    await db.insert(playerCareerStats).values({
      serverId: server.id,
      steamId: "1",
      displayName: "Alice",
      kills: 0,
      deaths: 0,
      cash: 0,
      matchesPlayed: 1,
    });
    const addedAt = new Date("2026-10-01T00:00:00Z");
    await db.insert(reservedSlots).values([
      { steamId: "1", name: null, addedAt },
      { steamId: "2", name: "Bob", addedAt },
    ]);

    const html = renderToStaticMarkup(await WhitelistPage());

    expect(html).toContain('href="/players/1"');
    expect(html).toContain(">Alice</a>");
    expect(html).toContain('href="https://steamcommunity.com/profiles/2"');
    expect(html).toContain(">Bob</a>");
    expect(html).toContain("01/10/2026");
  });
});
