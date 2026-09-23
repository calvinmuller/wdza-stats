import {
  createDb,
  listenTo,
  VERIFIED_PLAYER_CLAIMED_CHANNEL,
  verifiedPlayerSessions,
  verifiedPlayers,
  type Database,
} from "@wdza-stats/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  getVerifiedPlayerSteamId,
  signInVerifiedPlayer,
  signOutVerifiedPlayer,
  VERIFIED_PLAYER_SESSION_SECONDS,
} from "./verified-player";

const db: Database = createDb(process.env.DATABASE_URL!);
const STEAM_ID = "76561198000000001";

afterEach(async () => {
  await db.delete(verifiedPlayerSessions);
  await db.delete(verifiedPlayers);
});

afterAll(async () => {
  await db.$client.end();
});

describe("signInVerifiedPlayer", () => {
  it("claims an unclaimed steamId on first sign-in and starts a session", async () => {
    const signIn = await signInVerifiedPlayer(db, STEAM_ID);

    expect(signIn.firstClaim).toBe(true);
    await expect(getVerifiedPlayerSteamId(db, signIn.token)).resolves.toBe(STEAM_ID);
    const [player] = await db.select().from(verifiedPlayers).where(eq(verifiedPlayers.steamId, STEAM_ID));
    expect(player).toBeDefined();
  });

  it("signs an existing Verified Player in again without re-claiming", async () => {
    const claimedAt = new Date("2026-09-01T00:00:00Z");
    await signInVerifiedPlayer(db, STEAM_ID, claimedAt);
    const later = new Date("2026-09-20T00:00:00Z");

    const again = await signInVerifiedPlayer(db, STEAM_ID, later);

    expect(again.firstClaim).toBe(false);
    const [player] = await db.select().from(verifiedPlayers).where(eq(verifiedPlayers.steamId, STEAM_ID));
    expect(player.claimedAt).toEqual(claimedAt);
    expect(player.lastSignedInAt).toEqual(later);
  });

  it("stores only a hash of the session token", async () => {
    const { token } = await signInVerifiedPlayer(db, STEAM_ID);
    const rows = await db.select().from(verifiedPlayerSessions);
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(token);
  });

  it("announces a first claim to the Worker, and only a first claim", async () => {
    const received: string[] = [];
    const listener = listenTo(process.env.DATABASE_URL!, VERIFIED_PLAYER_CLAIMED_CHANNEL, (payload) => {
      received.push(payload);
    });
    await listener.ready;
    try {
      await signInVerifiedPlayer(db, STEAM_ID);
      await signInVerifiedPlayer(db, STEAM_ID);
      await expect.poll(() => received).toEqual([STEAM_ID]);
      // Give a wrongly-sent second notification time to arrive.
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(received).toEqual([STEAM_ID]);
    } finally {
      await listener.stop();
    }
  });
});

describe("getVerifiedPlayerSteamId", () => {
  it("reads an expired session as signed out", async () => {
    const start = new Date("2026-09-01T00:00:00Z");
    const { token } = await signInVerifiedPlayer(db, STEAM_ID, start);

    const justBefore = new Date(start.getTime() + VERIFIED_PLAYER_SESSION_SECONDS * 1000 - 1000);
    const after = new Date(start.getTime() + VERIFIED_PLAYER_SESSION_SECONDS * 1000 + 1000);
    await expect(getVerifiedPlayerSteamId(db, token, justBefore)).resolves.toBe(STEAM_ID);
    await expect(getVerifiedPlayerSteamId(db, token, after)).resolves.toBeNull();
  });

  it("reads an unknown token as signed out", async () => {
    await expect(getVerifiedPlayerSteamId(db, "not-a-real-token")).resolves.toBeNull();
  });
});

describe("signOutVerifiedPlayer", () => {
  it("ends only that browser's session", async () => {
    const phone = await signInVerifiedPlayer(db, STEAM_ID);
    const laptop = await signInVerifiedPlayer(db, STEAM_ID);

    await signOutVerifiedPlayer(db, phone.token);

    await expect(getVerifiedPlayerSteamId(db, phone.token)).resolves.toBeNull();
    await expect(getVerifiedPlayerSteamId(db, laptop.token)).resolves.toBe(STEAM_ID);
  });
});
