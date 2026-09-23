import { createDb, kickVotes, servers, type Database } from "@wdza-stats/db";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

// The page checks this browser's visitor session; this visitor has none.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const { default: KickVotePage } = await import("./page");

const db: Database = createDb(process.env.DATABASE_URL!);
const INITIATOR = "76561198000000100";

afterEach(async () => {
  await db.delete(kickVotes);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

describe("KickVotePage", () => {
  it("never shows who started the KickVote", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: `http://rcon-kick-page-${crypto.randomUUID()}.test:9006` })
      .returning();
    const [vote] = await db
      .insert(kickVotes)
      .values({
        serverId: server.id,
        targetSteamId: "1",
        targetName: "Cheatermc",
        reason: "wallhacks",
        initiatorSteamId: INITIATOR,
        threshold: 25,
        durationSeconds: 300,
        endsAt: new Date(Date.now() + 300_000),
      })
      .returning();

    const html = renderToStaticMarkup(await KickVotePage({ params: Promise.resolve({ id: String(vote.id) }) }));

    expect(html).toContain("Cheatermc");
    expect(html).not.toContain(INITIATOR);
  });
});
