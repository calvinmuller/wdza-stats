import {
  createDb,
  kickVoteSettings,
  kickVotes,
  latestSnapshots,
  servers,
  type Database,
} from "@wdza-stats/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { snapshotFixture } from "./live-snapshot-fixture";
import { getActiveKickVote, startKickVote } from "./kick-vote";

const db: Database = createDb(process.env.DATABASE_URL!);

afterEach(async () => {
  await db.delete(kickVotes);
  await db.delete(latestSnapshots);
  await db.delete(servers);
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
