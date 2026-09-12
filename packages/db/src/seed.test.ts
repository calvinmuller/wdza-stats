import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Database } from "./client";
import { servers } from "./schema";
import { seedServer } from "./seed";

const db: Database = createDb(process.env.DATABASE_URL!);

beforeEach(async () => {
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

describe("seedServer", () => {
  it("inserts a new Server row", async () => {
    const server = await seedServer(db, {
      name: "Test Server",
      baseUrl: "http://example.test:9006",
    });

    expect(server).toMatchObject({
      name: "Test Server",
      baseUrl: "http://example.test:9006",
    });
  });

  it("upserts by baseUrl instead of creating a duplicate row", async () => {
    await seedServer(db, { name: "Old Name", baseUrl: "http://example.test:9006" });
    await seedServer(db, { name: "New Name", baseUrl: "http://example.test:9006" });

    const rows = await db.select().from(servers);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "New Name", baseUrl: "http://example.test:9006" });
  });
});
