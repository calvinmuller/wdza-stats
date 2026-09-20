import { createDb, servers, type Database } from "@wdza-stats/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/ingest/events/route";
import { generateFeedToken } from "./feed-token";

const db: Database = createDb(process.env.DATABASE_URL!);

afterEach(async () => {
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

async function seedServer() {
  const [server] = await db
    .insert(servers)
    .values({ name: "WDZA Test", baseUrl: "http://rcon.test" })
    .returning();
  return server;
}

// What the game does: post an (empty) batch with the token as its bearer.
async function postWith(token: string) {
  return POST(
    new Request("http://localhost/api/ingest/events", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ serverId: "boot", serverName: "x", events: [] }),
    }),
  );
}

describe("generateFeedToken", () => {
  it("returns a token the game can authenticate with", async () => {
    const server = await seedServer();

    const token = await generateFeedToken(db, server.id);

    expect(token).toMatch(/^wkf_[A-Za-z0-9_-]{43}$/);
    expect((await postWith(token!)).status).toBe(200);
  });

  it("stores only a hash, never the token itself", async () => {
    const server = await seedServer();

    const token = await generateFeedToken(db, server.id);

    const [row] = await db.select().from(servers).where(eq(servers.id, server.id));
    expect(row.feedTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.feedTokenHash).not.toContain(token!);
  });

  it("makes the previous token stop working when regenerated", async () => {
    const server = await seedServer();
    const first = await generateFeedToken(db, server.id);

    const second = await generateFeedToken(db, server.id);

    expect(second).not.toBe(first);
    expect((await postWith(first!)).status).toBe(401);
    expect((await postWith(second!)).status).toBe(200);
  });

  it("returns null for a Server that does not exist", async () => {
    expect(await generateFeedToken(db, 999_999)).toBeNull();
  });
});
