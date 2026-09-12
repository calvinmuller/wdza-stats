import { createDb, servers, type Database } from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { runHeartbeat } from "./heartbeat";

const db: Database = createDb(process.env.DATABASE_URL!);

afterEach(async () => {
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

describe("runHeartbeat", () => {
  it("returns the tracked Server row for a known baseUrl", async () => {
    await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: "http://rcon.test:9006" });

    const result = await runHeartbeat(db, "http://rcon.test:9006");

    expect(result).toMatchObject({
      name: "WDZA Test",
      baseUrl: "http://rcon.test:9006",
    });
  });

  it("throws when no Server has been seeded for the given baseUrl", async () => {
    await expect(runHeartbeat(db, "http://unknown.test:9006")).rejects.toThrow(
      /No Server row found/,
    );
  });
});
