import {
  createDb,
  kickVoteBallots,
  kickVoteSettings,
  kickVotes,
  latestSnapshots,
  servers,
  staffMembers,
  type Database,
} from "@wdza-stats/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { snapshotFixture } from "./live-snapshot-fixture";
import { createStaffMember } from "./staff";
import {
  cancelKickVote,
  castBallot,
  getActiveKickVote,
  getBallotCount,
  getKickVote,
  hasCastBallot,
  listActiveKickVotes,
  startKickVote,
} from "./kick-vote";

const db: Database = createDb(process.env.DATABASE_URL!);

afterEach(async () => {
  await db.delete(kickVoteBallots);
  await db.delete(kickVotes);
  await db.delete(latestSnapshots);
  await db.delete(servers);
  await db.delete(staffMembers);
  // Restore the migration-seeded defaults other tests rely on.
  await db
    .update(kickVoteSettings)
    .set({ thresholdBallots: 25, durationSeconds: 300, initiatorCooldownSeconds: 600 })
    .where(eq(kickVoteSettings.id, 1));
});

afterAll(async () => {
  await db.$client.end();
});

async function seedOnlineServer(steamId = "1", displayName = "Cheatermc") {
  const [server] = await db
    .insert(servers)
    .values({ name: "WDZA Test", baseUrl: `http://rcon-kick-vote-${crypto.randomUUID()}.test:9006` })
    .returning();
  await db.insert(latestSnapshots).values({
    serverId: server.id,
    capturedAt: new Date(),
    payload: snapshotFixture({
      players: [{ steamId, displayName, faction: "Lonestar", kills: 0, deaths: 0, cash: 0, ping: 40 }],
    }),
  });
  return server;
}

describe("startKickVote", () => {
  it("starts a KickVote against a currently-online target, snapshotting settings onto the row", async () => {
    const server = await seedOnlineServer("1", "Cheatermc");

    const result = await startKickVote(db, {
      serverId: server.id,
      targetSteamId: "1",
      reason: "wallhacks",
      initiatorSessionId: "session-1",
    });

    expect(result).toEqual({ ok: true, kickVoteId: expect.any(Number) });
    const active = await getActiveKickVote(db, server.id);
    expect(active).toMatchObject({ targetName: "Cheatermc", reason: "wallhacks" });

    const [row] = await db.select().from(kickVotes).where(eq(kickVotes.serverId, server.id));
    expect(row).toMatchObject({
      targetSteamId: "1",
      targetName: "Cheatermc",
      threshold: 25,
      durationSeconds: 300,
      status: "active",
    });
  });

  it("rejects an empty reason", async () => {
    const server = await seedOnlineServer();

    const result = await startKickVote(db, {
      serverId: server.id,
      targetSteamId: "1",
      reason: "   ",
      initiatorSessionId: "session-1",
    });

    expect(result).toEqual({ ok: false, error: expect.any(String) });
    expect(await getActiveKickVote(db, server.id)).toBeNull();
  });

  it("rejects a target that isn't currently online", async () => {
    const server = await seedOnlineServer();

    const result = await startKickVote(db, {
      serverId: server.id,
      targetSteamId: "not-online",
      reason: "wallhacks",
      initiatorSessionId: "session-1",
    });

    expect(result).toEqual({ ok: false, error: expect.any(String) });
    expect(await getActiveKickVote(db, server.id)).toBeNull();
  });

  it("rejects starting a second KickVote while one is already active on that Server, without a second row appearing", async () => {
    const server = await seedOnlineServer();
    const first = await startKickVote(db, {
      serverId: server.id,
      targetSteamId: "1",
      reason: "wallhacks",
      initiatorSessionId: "session-1",
    });
    expect(first.ok).toBe(true);

    const second = await startKickVote(db, {
      serverId: server.id,
      targetSteamId: "1",
      reason: "aimbot",
      initiatorSessionId: "session-2",
    });

    expect(second).toEqual({ ok: false, error: expect.any(String) });
    const rows = await db.select().from(kickVotes).where(eq(kickVotes.serverId, server.id));
    expect(rows).toHaveLength(1);
  });

  it("blocks a session from starting another KickVote inside its cooldown window", async () => {
    await db
      .update(kickVoteSettings)
      .set({ initiatorCooldownSeconds: 3600 })
      .where(eq(kickVoteSettings.id, 1));
    const first = await seedOnlineServer("1", "Cheatermc");
    const second = await seedOnlineServer("2", "AlsoCheating");

    const firstStart = await startKickVote(db, {
      serverId: first.id,
      targetSteamId: "1",
      reason: "wallhacks",
      initiatorSessionId: "same-session",
    });
    expect(firstStart.ok).toBe(true);

    const secondStart = await startKickVote(db, {
      serverId: second.id,
      targetSteamId: "2",
      reason: "aimbot",
      initiatorSessionId: "same-session",
    });

    expect(secondStart).toEqual({ ok: false, error: expect.any(String) });
    expect(await getActiveKickVote(db, second.id)).toBeNull();
  });
});

async function startedVote(initiatorSessionId = "initiator") {
  const server = await seedOnlineServer();
  const started = await startKickVote(db, {
    serverId: server.id,
    targetSteamId: "1",
    reason: "wallhacks",
    initiatorSessionId,
  });
  if (!started.ok) throw new Error("failed to start KickVote in test setup");
  return started.kickVoteId;
}

describe("castBallot", () => {
  it("casts a Ballot, making it visible via getBallotCount and hasCastBallot", async () => {
    const kickVoteId = await startedVote();

    const result = await castBallot(db, { kickVoteId, sessionId: "voter-1" });

    expect(result).toEqual({ ok: true, kickVoteId });
    expect(await getBallotCount(db, kickVoteId)).toBe(1);
    expect(await hasCastBallot(db, kickVoteId, "voter-1")).toBe(true);
    expect(await hasCastBallot(db, kickVoteId, "voter-2")).toBe(false);
  });

  it("produces exactly one row when the same session casts twice, as a no-op rather than an error", async () => {
    const kickVoteId = await startedVote();

    const first = await castBallot(db, { kickVoteId, sessionId: "voter-1" });
    const second = await castBallot(db, { kickVoteId, sessionId: "voter-1" });

    expect(first).toEqual({ ok: true, kickVoteId });
    expect(second).toEqual({ ok: true, kickVoteId });
    expect(await getBallotCount(db, kickVoteId)).toBe(1);
  });

  it("rejects casting on a KickVote that no longer exists", async () => {
    const result = await castBallot(db, { kickVoteId: 999_999, sessionId: "voter-1" });

    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it("rejects casting on a KickVote that has already ended", async () => {
    const kickVoteId = await startedVote();
    await db.update(kickVotes).set({ status: "expired", resolvedAt: new Date() }).where(eq(kickVotes.id, kickVoteId));

    const result = await castBallot(db, { kickVoteId, sessionId: "voter-1" });

    expect(result).toEqual({ ok: false, error: expect.any(String) });
    expect(await getBallotCount(db, kickVoteId)).toBe(0);
  });

  it("rejects casting once endsAt has passed, even before the Worker has marked the KickVote expired", async () => {
    const kickVoteId = await startedVote();
    await db.update(kickVotes).set({ endsAt: new Date(Date.now() - 1_000) }).where(eq(kickVotes.id, kickVoteId));

    const result = await castBallot(db, { kickVoteId, sessionId: "voter-1" });

    expect(result).toEqual({ ok: false, error: expect.any(String) });
    expect(await getBallotCount(db, kickVoteId)).toBe(0);
  });
});

describe("getKickVote", () => {
  it("returns null for an id that doesn't exist", async () => {
    expect(await getKickVote(db, 999_999)).toBeNull();
  });

  it("returns the full row for an id that does", async () => {
    const kickVoteId = await startedVote();

    const vote = await getKickVote(db, kickVoteId);

    expect(vote).toMatchObject({ id: kickVoteId, targetName: "Cheatermc", reason: "wallhacks", status: "active" });
  });
});

describe("listActiveKickVotes", () => {
  it("lists only active KickVotes, with their Server, Ballot count and threshold", async () => {
    const kickVoteId = await startedVote();
    await castBallot(db, { kickVoteId, sessionId: "voter-1" });
    const ended = await startedVote("another-initiator");
    await db.update(kickVotes).set({ status: "expired", resolvedAt: new Date() }).where(eq(kickVotes.id, ended));

    const rows = await listActiveKickVotes(db);

    expect(rows).toEqual([
      expect.objectContaining({
        id: kickVoteId,
        serverName: "WDZA Test",
        targetName: "Cheatermc",
        targetSteamId: "1",
        reason: "wallhacks",
        ballotCount: 1,
        threshold: 25,
        endsAt: expect.any(Date),
      }),
    ]);
  });
});

describe("cancelKickVote", () => {
  async function moderator() {
    return createStaffMember({ email: "mod@example.test", name: "Mod", password: "correct horse battery", role: "moderator" });
  }

  it("ends an active KickVote as staffCancelled, recording who cancelled it", async () => {
    const kickVoteId = await startedVote();
    const mod = await moderator();

    const result = await cancelKickVote(db, { kickVoteId, staffMemberId: mod.id });

    expect(result).toEqual({ ok: true, kickVoteId });
    const [row] = await db.select().from(kickVotes).where(eq(kickVotes.id, kickVoteId));
    expect(row).toMatchObject({ status: "staffCancelled", cancelledByStaffMemberId: mod.id, resolvedAt: expect.any(Date) });
  });

  it("refuses to overwrite a KickVote that has already resolved", async () => {
    const kickVoteId = await startedVote();
    const resolvedAt = new Date();
    await db.update(kickVotes).set({ status: "succeeded", resolvedAt }).where(eq(kickVotes.id, kickVoteId));
    const mod = await moderator();

    const result = await cancelKickVote(db, { kickVoteId, staffMemberId: mod.id });

    expect(result).toEqual({ ok: false, error: expect.any(String) });
    const [row] = await db.select().from(kickVotes).where(eq(kickVotes.id, kickVoteId));
    expect(row).toMatchObject({ status: "succeeded", cancelledByStaffMemberId: null, resolvedAt });
  });
});
