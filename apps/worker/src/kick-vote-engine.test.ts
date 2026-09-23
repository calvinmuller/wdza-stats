import { createDb, kickVotes, servers, type Database } from "@wdza-stats/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { announceKickVote, buildKickVoteBroadcast } from "./kick-vote-engine";
import type { RconClient } from "./rcon-client";
import { statusFixture, playersFixture } from "./rcon-fixture";

const db: Database = createDb(process.env.DATABASE_URL!);

afterEach(async () => {
  await db.delete(kickVotes);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

function fakeRconClient(): RconClient & { broadcast: ReturnType<typeof vi.fn> } {
  return {
    fetchStatus: () => Promise.resolve(statusFixture()),
    fetchPlayers: () => Promise.resolve(playersFixture()),
    fetchRotation: () => Promise.resolve({ entries: [] }),
    kickPlayer: vi.fn(async () => {}),
    broadcast: vi.fn(async () => {}),
  };
}

async function seedServer() {
  const [server] = await db
    .insert(servers)
    .values({ name: "Test Server", baseUrl: `http://rcon-kick-vote-engine-${crypto.randomUUID()}.test:9006` })
    .returning();
  return server;
}

async function seedActiveVote(serverId: number, overrides: Partial<typeof kickVotes.$inferInsert> = {}) {
  const [vote] = await db
    .insert(kickVotes)
    .values({
      serverId,
      targetSteamId: "1",
      targetName: "Cheatermc",
      reason: "wallhacks",
      initiatorSessionId: "session-1",
      threshold: 25,
      durationSeconds: 300,
      endsAt: new Date(Date.now() + 300_000),
      status: "active",
      ...overrides,
    })
    .returning();
  return vote;
}

describe("buildKickVoteBroadcast", () => {
  it("points at the bare /kick path when it's the only active KickVote", () => {
    const message = buildKickVoteBroadcast({ id: 7, targetName: "Cheatermc", reason: "wallhacks" }, 1);

    expect(message).toBe(
      "Kick vote started against Cheatermc - reason: wallhacks - vote now: stats.wardogsza.co.za/kick",
    );
  });

  it("appends the KickVote's id once more than one is active at once", () => {
    const message = buildKickVoteBroadcast({ id: 7, targetName: "Cheatermc", reason: "wallhacks" }, 2);

    expect(message).toBe(
      "Kick vote started against Cheatermc - reason: wallhacks - vote now: stats.wardogsza.co.za/kick/7",
    );
  });
});

describe("announceKickVote", () => {
  it("broadcasts the started KickVote via RCON", async () => {
    const server = await seedServer();
    const vote = await seedActiveVote(server.id);
    const client = fakeRconClient();

    await announceKickVote(db, client, vote.id);

    expect(client.broadcast).toHaveBeenCalledWith(
      "Kick vote started against Cheatermc - reason: wallhacks - vote now: stats.wardogsza.co.za/kick",
    );
  });

  it("does nothing for a KickVote that no longer exists", async () => {
    const client = fakeRconClient();

    await announceKickVote(db, client, 999_999);

    expect(client.broadcast).not.toHaveBeenCalled();
  });

  it("does nothing for a KickVote that already resolved before the announcement ran", async () => {
    const server = await seedServer();
    const vote = await seedActiveVote(server.id, { status: "targetLeft", resolvedAt: new Date() });
    const client = fakeRconClient();

    await announceKickVote(db, client, vote.id);

    expect(client.broadcast).not.toHaveBeenCalled();
  });
});
