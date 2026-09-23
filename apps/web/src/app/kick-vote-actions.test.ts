import { createDb, kickVotes, latestSnapshots, servers, type Database } from "@wdza-stats/db";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { snapshotFixture } from "@/lib/live-snapshot-fixture";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let cookieStore: Map<string, string>;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name)! } : undefined),
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
  }),
}));

const { startKickVoteAction } = await import("./kick-vote-actions");

const db: Database = createDb(process.env.DATABASE_URL!);

beforeEach(() => {
  cookieStore = new Map();
});

afterEach(async () => {
  await db.delete(kickVotes);
  await db.delete(latestSnapshots);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

async function seedOnlineServer() {
  const [server] = await db
    .insert(servers)
    .values({ name: "Test", baseUrl: `http://rcon-kick-vote-actions-${crypto.randomUUID()}.test:9006` })
    .returning();
  await db.insert(latestSnapshots).values({
    serverId: server.id,
    capturedAt: new Date(),
    payload: snapshotFixture({
      players: [{ steamId: "1", displayName: "Cheatermc", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, ping: 40 }],
    }),
  });
  return server;
}

describe("startKickVoteAction", () => {
  it("starts a KickVote, minting a visitor session cookie for the caller", async () => {
    const server = await seedOnlineServer();

    const result = await startKickVoteAction(
      null,
      form({ serverId: String(server.id), targetSteamId: "1", reason: "wallhacks" }),
    );

    expect(result).toEqual({ ok: true });
    expect(cookieStore.size).toBe(1);
  });

  it("reuses the same visitor session across calls instead of minting a new one each time", async () => {
    const server = await seedOnlineServer();
    await startKickVoteAction(null, form({ serverId: String(server.id), targetSteamId: "1", reason: "wallhacks" }));
    const sessionAfterFirstCall = [...cookieStore.values()][0];

    // A second Server so the active-vote check doesn't reject this call for
    // an unrelated reason - only the cooldown check matters here.
    const secondServer = await seedOnlineServer();
    const result = await startKickVoteAction(
      null,
      form({ serverId: String(secondServer.id), targetSteamId: "1", reason: "aimbot" }),
    );

    expect([...cookieStore.values()][0]).toBe(sessionAfterFirstCall);
    // Same session, still in its cooldown window from the first call.
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it("rejects an unparsable Server id without touching the database", async () => {
    const result = await startKickVoteAction(
      null,
      form({ serverId: "not-a-number", targetSteamId: "1", reason: "wallhacks" }),
    );

    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });
});
