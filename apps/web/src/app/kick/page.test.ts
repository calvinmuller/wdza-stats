import { createDb, kickVotes, servers, type Database } from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const { default: ActiveKickVoteRedirect } = await import("./page");

const db: Database = createDb(process.env.DATABASE_URL!);

afterEach(async () => {
  await db.delete(kickVotes);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

// next/navigation's redirect() throws; its digest carries the target URL.
async function redirectTarget(): Promise<string> {
  try {
    await ActiveKickVoteRedirect();
  } catch (error) {
    return String((error as { digest?: string }).digest).split(";")[2];
  }
  throw new Error("expected a redirect");
}

describe("ActiveKickVoteRedirect", () => {
  it("sends players to the active KickVote", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: `http://rcon-kick-redirect-${crypto.randomUUID()}.test:9006` })
      .returning();
    const [vote] = await db
      .insert(kickVotes)
      .values({
        serverId: server.id,
        targetSteamId: "1",
        targetName: "Cheatermc",
        reason: "wallhacks",
        initiatorSteamId: "76561198000000100",
        threshold: 25,
        durationSeconds: 300,
        endsAt: new Date(Date.now() + 300_000),
      })
      .returning();

    expect(await redirectTarget()).toBe(`/kick/${vote.id}`);
  });

  it("sends players home when no KickVote is active", async () => {
    expect(await redirectTarget()).toBe("/");
  });
});
