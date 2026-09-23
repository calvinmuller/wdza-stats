import {
  createDb,
  KICK_VOTE_UPDATED_CHANNEL,
  kickVoteBallots,
  kickVotes,
  latestSnapshots,
  listenTo,
  servers,
  type Database,
  type Snapshot,
} from "@wdza-stats/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { announceKickVote, buildKickVoteBroadcast, resolveKickVote, sweepKickVotes } from "./kick-vote-engine";
import type { RconClient } from "./rcon-client";
import { statusFixture, playersFixture } from "./rcon-fixture";

const db: Database = createDb(process.env.DATABASE_URL!);

afterEach(async () => {
  await db.delete(kickVoteBallots);
  await db.delete(kickVotes);
  await db.delete(latestSnapshots);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

function fakeRconClient(): RconClient & {
  broadcast: ReturnType<typeof vi.fn>;
  kickPlayer: ReturnType<typeof vi.fn>;
} {
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
      initiatorSteamId: "76561198000000100",
      threshold: 25,
      durationSeconds: 300,
      endsAt: new Date(Date.now() + 300_000),
      status: "active",
      ...overrides,
    })
    .returning();
  return vote;
}

function snapshotWithPlayers(steamIds: string[]): Snapshot {
  return {
    map: "Sandstorm",
    lighting: "Day",
    alternator: "None",
    experiences: ["TeamDeathmatch"],
    rotation: { nowIndex: 0, entries: [{ map: "Sandstorm" }] },
    factions: [],
    players: steamIds.map((steamId) => ({
      steamId,
      displayName: `Player ${steamId}`,
      faction: "Lonestar",
      kills: 0,
      deaths: 0,
      cash: 0,
      ping: 40,
    })),
    playerSlots: { current: steamIds.length, max: 100 },
  };
}

async function seedOnline(serverId: number, steamIds: string[]) {
  await db
    .insert(latestSnapshots)
    .values({ serverId, capturedAt: new Date(), payload: snapshotWithPlayers(steamIds) })
    .onConflictDoUpdate({
      target: latestSnapshots.serverId,
      set: { payload: snapshotWithPlayers(steamIds), capturedAt: new Date() },
    });
}

async function seedBallots(kickVoteId: number, count: number, castAt = new Date()) {
  await db.insert(kickVoteBallots).values(
    Array.from({ length: count }, (_, i) => ({ kickVoteId, sessionId: `ballot-${i}`, castAt })),
  );
}

async function statusOf(kickVoteId: number) {
  const [row] = await db
    .select({ status: kickVotes.status, resolvedAt: kickVotes.resolvedAt })
    .from(kickVotes)
    .where(eq(kickVotes.id, kickVoteId));
  return row;
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

describe("resolveKickVote", () => {
  it("kicks the target and marks the KickVote succeeded once its Ballots reach the threshold", async () => {
    const server = await seedServer();
    await seedOnline(server.id, ["1"]);
    const vote = await seedActiveVote(server.id, { threshold: 3 });
    await seedBallots(vote.id, 3);
    const client = fakeRconClient();

    await resolveKickVote(db, client, server.id, vote.id);

    expect(client.kickPlayer).toHaveBeenCalledWith("1");
    expect(await statusOf(vote.id)).toEqual({ status: "succeeded", resolvedAt: expect.any(Date) });
  });

  it("does not kick when the threshold-crossing Ballot arrived after endsAt - expiry wins the race", async () => {
    const server = await seedServer();
    await seedOnline(server.id, ["1"]);
    const endsAt = new Date(Date.now() - 1_000);
    const vote = await seedActiveVote(server.id, { threshold: 3, endsAt });
    await seedBallots(vote.id, 2, new Date(endsAt.getTime() - 10_000));
    await db.insert(kickVoteBallots).values({ kickVoteId: vote.id, sessionId: "late", castAt: new Date() });
    const client = fakeRconClient();

    await resolveKickVote(db, client, server.id, vote.id);

    expect(client.kickPlayer).not.toHaveBeenCalled();
    expect(await statusOf(vote.id)).toEqual({ status: "expired", resolvedAt: expect.any(Date) });
  });

  it("ends the KickVote as targetLeft, without a kick, once the target is gone from the Server's latest Snapshot", async () => {
    const server = await seedServer();
    await seedOnline(server.id, ["2"]);
    const vote = await seedActiveVote(server.id, { threshold: 3 });
    const client = fakeRconClient();

    await resolveKickVote(db, client, server.id, vote.id);

    expect(client.kickPlayer).not.toHaveBeenCalled();
    expect(await statusOf(vote.id)).toEqual({ status: "targetLeft", resolvedAt: expect.any(Date) });
  });

  it("never kicks a target who already left, even if the threshold has been reached", async () => {
    const server = await seedServer();
    await seedOnline(server.id, ["2"]);
    const vote = await seedActiveVote(server.id, { threshold: 3 });
    await seedBallots(vote.id, 3);
    const client = fakeRconClient();

    await resolveKickVote(db, client, server.id, vote.id);

    expect(client.kickPlayer).not.toHaveBeenCalled();
    expect((await statusOf(vote.id)).status).toBe("targetLeft");
  });

  it("leaves an in-window KickVote short of its threshold active while the target is still online", async () => {
    const server = await seedServer();
    await seedOnline(server.id, ["1"]);
    const vote = await seedActiveVote(server.id, { threshold: 3 });
    await seedBallots(vote.id, 2);
    const client = fakeRconClient();

    await resolveKickVote(db, client, server.id, vote.id);

    expect(client.kickPlayer).not.toHaveBeenCalled();
    expect(await statusOf(vote.id)).toEqual({ status: "active", resolvedAt: null });
  });

  it("tells open /kick/{id} pages the KickVote changed once it resolves", async () => {
    const server = await seedServer();
    await seedOnline(server.id, ["2"]);
    const vote = await seedActiveVote(server.id);
    const received: string[] = [];
    const listener = listenTo(process.env.DATABASE_URL!, KICK_VOTE_UPDATED_CHANNEL, (payload) => received.push(payload));
    await listener.ready;

    try {
      await resolveKickVote(db, fakeRconClient(), server.id, vote.id);
      await vi.waitFor(() => expect(received).toContain(String(vote.id)));
    } finally {
      await listener.stop();
    }
  });

  it("puts the KickVote back to active, for the next sweep to retry, when the RCON kick call fails", async () => {
    const server = await seedServer();
    await seedOnline(server.id, ["1"]);
    const vote = await seedActiveVote(server.id, { threshold: 3 });
    await seedBallots(vote.id, 3);
    const client = fakeRconClient();
    client.kickPlayer.mockRejectedValueOnce(new Error("RCON unreachable"));

    await expect(resolveKickVote(db, client, server.id, vote.id)).rejects.toThrow("RCON unreachable");
    expect(await statusOf(vote.id)).toEqual({ status: "active", resolvedAt: null });

    await sweepKickVotes(db, client, server.id);
    expect(client.kickPlayer).toHaveBeenCalledTimes(2);
    expect((await statusOf(vote.id)).status).toBe("succeeded");
  });

  it("never kicks a KickVote something else already resolved, even with enough Ballots", async () => {
    const server = await seedServer();
    await seedOnline(server.id, ["1"]);
    const vote = await seedActiveVote(server.id, { threshold: 3, status: "staffCancelled", resolvedAt: new Date() });
    await seedBallots(vote.id, 3);
    const client = fakeRconClient();

    await resolveKickVote(db, client, server.id, vote.id);

    expect(client.kickPlayer).not.toHaveBeenCalled();
    expect((await statusOf(vote.id)).status).toBe("staffCancelled");
  });

  it("leaves a KickVote that belongs to another Server alone", async () => {
    const server = await seedServer();
    const other = await seedServer();
    await seedOnline(other.id, ["1"]);
    const vote = await seedActiveVote(other.id, { threshold: 1 });
    await seedBallots(vote.id, 1);
    const client = fakeRconClient();

    await resolveKickVote(db, client, server.id, vote.id);

    expect(client.kickPlayer).not.toHaveBeenCalled();
    expect((await statusOf(vote.id)).status).toBe("active");
  });
});

describe("sweepKickVotes", () => {
  it("expires this Server's active KickVote once its window has closed short of the threshold", async () => {
    const server = await seedServer();
    await seedOnline(server.id, ["1"]);
    const vote = await seedActiveVote(server.id, { threshold: 3, endsAt: new Date(Date.now() - 1_000) });
    const client = fakeRconClient();

    await sweepKickVotes(db, client, server.id);

    expect(client.kickPlayer).not.toHaveBeenCalled();
    expect(await statusOf(vote.id)).toEqual({ status: "expired", resolvedAt: expect.any(Date) });
  });
});
