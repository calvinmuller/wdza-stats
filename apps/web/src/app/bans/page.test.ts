import { bannedPlayers, createDb, type Database } from "@wdza-stats/db";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import BansPage from "./page";

const db: Database = createDb(process.env.DATABASE_URL!);

afterEach(async () => {
  await db.delete(bannedPlayers);
});

afterAll(async () => {
  await db.$client.end();
});

describe("BansPage", () => {
  it("says so when nobody is banned", async () => {
    expect(renderToStaticMarkup(await BansPage())).toContain("Nobody is banned.");
  });

  it("lists each ban with its reason and date, linking an unnamed player to their Steam profile", async () => {
    await db.insert(bannedPlayers).values({
      steamId: "76561198000000001",
      reason: "Cheating",
      bannedAt: new Date("2026-10-07T13:18:24Z"),
      source: "warcon",
    });

    const html = renderToStaticMarkup(await BansPage());

    expect(html).toContain("Cheating");
    expect(html).toContain("07/10/2026");
    expect(html).toContain('href="https://steamcommunity.com/profiles/76561198000000001"');
    expect(html).toContain(">76561198000000001</a>");
  });
});
