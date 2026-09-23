import { createDb, verifiedPlayerSessions, verifiedPlayers, type Database } from "@wdza-stats/db";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getVerifiedPlayerSteamId, VERIFIED_PLAYER_COOKIE } from "@/lib/verified-player";
import { GET } from "./route";

const db: Database = createDb(process.env.DATABASE_URL!);
const ORIGIN = "http://stats.test";
const STEAM_ID = "76561198000000001";

beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_URL", ORIGIN);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await db.delete(verifiedPlayerSessions);
  await db.delete(verifiedPlayers);
});

afterAll(async () => {
  await db.$client.end();
});

function steamSays(isValid: boolean) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(`ns:http://specs.openid.net/auth/2.0\nis_valid:${isValid}\n`)));
}

// The browser arriving back from Steam, as Steam would send it.
function callbackRequest(returnTo: string): Request {
  const ourQuery = new URLSearchParams({ returnTo });
  const params = new URLSearchParams(ourQuery);
  params.set("openid.ns", "http://specs.openid.net/auth/2.0");
  params.set("openid.mode", "id_res");
  params.set("openid.op_endpoint", "https://steamcommunity.com/openid/login");
  params.set("openid.claimed_id", `https://steamcommunity.com/openid/id/${STEAM_ID}`);
  params.set("openid.identity", `https://steamcommunity.com/openid/id/${STEAM_ID}`);
  params.set("openid.return_to", `${ORIGIN}/api/steam/callback?${ourQuery}`);
  params.set("openid.response_nonce", "2026-09-23T10:00:00Zabc");
  params.set("openid.assoc_handle", "1234567890");
  params.set("openid.signed", "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle");
  params.set("openid.sig", "c2lnbmF0dXJl");
  return new Request(`${ORIGIN}/api/steam/callback?${params}`);
}

function sessionToken(response: Response): string | undefined {
  return response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${VERIFIED_PLAYER_COOKIE}=`))
    ?.split(";")[0]
    .slice(VERIFIED_PLAYER_COOKIE.length + 1);
}

describe("GET /api/steam/callback", () => {
  it("signs in the steamId Steam confirms and returns the player to where they started", async () => {
    steamSays(true);

    const response = await GET(callbackRequest("/kick/7"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/kick/7`);
    const cookie = response.headers.getSetCookie().find((c) => c.startsWith(`${VERIFIED_PLAYER_COOKIE}=`))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    await expect(getVerifiedPlayerSteamId(db, sessionToken(response)!)).resolves.toBe(STEAM_ID);
  });

  it("creates no Verified Player or session for an assertion Steam rejects", async () => {
    steamSays(false);

    const response = await GET(callbackRequest("/kick/7"));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/kick/7?steamSignIn=failed`);
    expect(sessionToken(response)).toBeUndefined();
    await expect(db.select().from(verifiedPlayers)).resolves.toEqual([]);
    await expect(db.select().from(verifiedPlayerSessions)).resolves.toEqual([]);
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example"])(
    "sends an off-site return-to (%s) home instead",
    async (returnTo) => {
      steamSays(true);
      const response = await GET(callbackRequest(returnTo));
      expect(response.headers.get("location")).toBe(`${ORIGIN}/`);
    },
  );
});
