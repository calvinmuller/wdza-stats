import {
  createDb,
  kickVoteBallots,
  kickVotes,
  kickVoteSettings,
  latestSnapshots,
  servers,
  staffMembers,
  verifiedPlayers,
  type Database,
  type StaffRole,
} from "@wdza-stats/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { snapshotFixture } from "@/lib/live-snapshot-fixture";
import { createStaffMember } from "@/lib/staff";
import { signInVerifiedPlayer, VERIFIED_PLAYER_COOKIE } from "@/lib/verified-player";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let cookieStore: Map<string, string>;
let requestHeaders: Headers;
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders,
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name)! } : undefined),
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
  }),
}));

const { castBallotAction, startKickVoteAction } = await import("./kick-vote-actions");

const db: Database = createDb(process.env.DATABASE_URL!);

beforeEach(() => {
  cookieStore = new Map();
  requestHeaders = new Headers();
});

afterEach(async () => {
  await db.delete(kickVoteBallots);
  await db.delete(kickVotes);
  await db.delete(latestSnapshots);
  await db.delete(servers);
  await db.delete(verifiedPlayers);
  await db.delete(staffMembers);
  await db.update(kickVoteSettings).set({ initiatorCooldownSeconds: 600 }).where(eq(kickVoteSettings.id, 1));
});

afterAll(async () => {
  await db.$client.end();
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const INITIATOR = "76561198000000100";

/** A fresh browser, signed in with Steam as `steamId`. */
async function signInAs(steamId: string) {
  const { token } = await signInVerifiedPlayer(db, steamId);
  cookieStore = new Map([[VERIFIED_PLAYER_COOKIE, token]]);
}

/** A fresh browser, signed in to the staff area as `role`, optionally with a linked steamId. */
async function signInAsStaff(role: StaffRole, steamId: string | null) {
  const email = `${role}@example.test`;
  const password = "correct horse battery";
  const staff = await createStaffMember({ email, name: role, password, role });
  if (steamId) await db.update(staffMembers).set({ steamId }).where(eq(staffMembers.id, staff.id));
  const { headers } = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true });
  cookieStore = new Map();
  requestHeaders = new Headers({
    cookie: headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  });
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
      players: [
        { steamId: "1", displayName: "Cheatermc", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, ping: 40 },
        { steamId: INITIATOR, displayName: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, ping: 40 },
      ],
    }),
  });
  return server;
}

describe("startKickVoteAction", () => {
  it("refuses a visitor who hasn't signed in with Steam", async () => {
    const server = await seedOnlineServer();

    const result = await startKickVoteAction(
      null,
      form({ serverId: String(server.id), targetSteamId: "1", reason: "wallhacks" }),
    );

    expect(result).toEqual({ ok: false, error: expect.stringContaining("Sign in with Steam") });
    await expect(db.select().from(kickVotes)).resolves.toEqual([]);
  });

  it("starts a KickVote as the signed-in Verified Player, whatever the form claims", async () => {
    const server = await seedOnlineServer();
    await signInAs(INITIATOR);

    const result = await startKickVoteAction(
      null,
      form({ serverId: String(server.id), targetSteamId: "1", reason: "wallhacks", initiatorSteamId: "1" }),
    );

    expect(result).toEqual({ ok: true });
    const [row] = await db.select().from(kickVotes).where(eq(kickVotes.serverId, server.id));
    expect(row.initiatorSteamId).toBe(INITIATOR);
  });

  it("starts a KickVote as a signed-in admin's linked steamId, without a Steam player sign-in", async () => {
    const server = await seedOnlineServer();
    await signInAsStaff("admin", INITIATOR);

    const result = await startKickVoteAction(
      null,
      form({ serverId: String(server.id), targetSteamId: "1", reason: "wallhacks", initiatorSteamId: "1" }),
    );

    expect(result).toEqual({ ok: true });
    const [row] = await db.select().from(kickVotes).where(eq(kickVotes.serverId, server.id));
    expect(row.initiatorSteamId).toBe(INITIATOR);
  });

  it("still requires an admin's linked steamId to be online on the Server", async () => {
    const server = await seedOnlineServer();
    await signInAsStaff("admin", "76561198000000999");

    const result = await startKickVoteAction(
      null,
      form({ serverId: String(server.id), targetSteamId: "1", reason: "wallhacks" }),
    );

    expect(result).toEqual({ ok: false, error: expect.stringContaining("playing on this Server") });
  });

  it("asks an admin without a linked steamId to link one", async () => {
    const server = await seedOnlineServer();
    await signInAsStaff("admin", null);

    const result = await startKickVoteAction(
      null,
      form({ serverId: String(server.id), targetSteamId: "1", reason: "wallhacks" }),
    );

    expect(result).toEqual({ ok: false, error: expect.stringContaining("Link your Steam account") });
    await expect(db.select().from(kickVotes)).resolves.toEqual([]);
  });

  it("doesn't let a moderator's staff login start a KickVote", async () => {
    const server = await seedOnlineServer();
    await signInAsStaff("moderator", INITIATOR);

    const result = await startKickVoteAction(
      null,
      form({ serverId: String(server.id), targetSteamId: "1", reason: "wallhacks" }),
    );

    expect(result).toEqual({ ok: false, error: expect.stringContaining("Sign in with Steam") });
    await expect(db.select().from(kickVotes)).resolves.toEqual([]);
  });

  it("keeps the cooldown when the same Verified Player signs in from a new browser", async () => {
    const server = await seedOnlineServer();
    await signInAs(INITIATOR);
    await startKickVoteAction(null, form({ serverId: String(server.id), targetSteamId: "1", reason: "wallhacks" }));

    // A second Server so the active-vote check doesn't reject this call for
    // an unrelated reason - only the cooldown check matters here.
    const secondServer = await seedOnlineServer();
    await signInAs(INITIATOR);
    const result = await startKickVoteAction(
      null,
      form({ serverId: String(secondServer.id), targetSteamId: "1", reason: "aimbot" }),
    );

    expect(result).toEqual({ ok: false, error: expect.stringContaining("recently") });
  });

  it("rejects an unparsable Server id without touching the database", async () => {
    const result = await startKickVoteAction(
      null,
      form({ serverId: "not-a-number", targetSteamId: "1", reason: "wallhacks" }),
    );

    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });
});

describe("castBallotAction", () => {
  it("casts a Ballot using a freshly-minted visitor session cookie", async () => {
    const server = await seedOnlineServer();
    await signInAs(INITIATOR);
    const started = await startKickVoteAction(
      null,
      form({ serverId: String(server.id), targetSteamId: "1", reason: "wallhacks" }),
    );
    if (!started?.ok) throw new Error("failed to start KickVote in test setup");
    cookieStore = new Map(); // a different, anonymous visitor casting the Ballot
    const [kickVote] = await db.select({ id: kickVotes.id }).from(kickVotes).where(eq(kickVotes.serverId, server.id));

    const result = await castBallotAction(null, form({ kickVoteId: String(kickVote.id) }));

    expect(result).toEqual({ ok: true });
    expect(cookieStore.size).toBe(1);
  });

  it("rejects an unparsable KickVote id", async () => {
    const result = await castBallotAction(null, form({ kickVoteId: "not-a-number" }));

    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });
});
