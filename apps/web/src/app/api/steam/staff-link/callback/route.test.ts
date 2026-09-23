import { staffAuditLog, staffMembers, verifiedPlayerSessions, verifiedPlayers } from "@wdza-stats/db";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createStaffMember } from "@/lib/staff";
import { getOwnSteamId } from "@/lib/staff-steam-link";

// getCurrentStaff reads the Staff Member's session through next/headers.
let requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));

const { GET } = await import("./route");

const ORIGIN = "http://stats.test";
const STEAM_ID = "76561198000000001";
const STATE = "state-from-link-start";
const PASSWORD = "correct horse battery";

beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_URL", ORIGIN);
  vi.stubGlobal("fetch", vi.fn(async () => new Response("ns:http://specs.openid.net/auth/2.0\nis_valid:true\n")));
  requestHeaders = new Headers();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await db.delete(staffAuditLog);
  await db.delete(staffMembers);
  await db.delete(verifiedPlayerSessions);
  await db.delete(verifiedPlayers);
});

afterAll(async () => {
  await db.$client.end();
});

/** Signs in a Staff Member and returns their Better Auth session cookie. */
async function signInStaff(): Promise<{ id: string; cookie: string }> {
  const user = await createStaffMember({ email: "mod@example.test", name: "Mod", password: PASSWORD, role: "moderator" });
  const { headers } = await auth.api.signInEmail({
    body: { email: "mod@example.test", password: PASSWORD },
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { id: user.id, cookie };
}

function callbackRequest(staffCookie: string, stateCookie: string | null = STATE): NextRequest {
  const ourQuery = new URLSearchParams({ returnTo: "/admin/account", state: STATE });
  const params = new URLSearchParams(ourQuery);
  params.set("openid.ns", "http://specs.openid.net/auth/2.0");
  params.set("openid.mode", "id_res");
  params.set("openid.op_endpoint", "https://steamcommunity.com/openid/login");
  params.set("openid.claimed_id", `https://steamcommunity.com/openid/id/${STEAM_ID}`);
  params.set("openid.identity", `https://steamcommunity.com/openid/id/${STEAM_ID}`);
  params.set("openid.return_to", `${ORIGIN}/api/steam/staff-link/callback?${ourQuery}`);
  params.set("openid.response_nonce", "2026-09-23T10:00:00Zabc");
  params.set("openid.assoc_handle", "1234567890");
  params.set("openid.signed", "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle");
  params.set("openid.sig", "c2lnbmF0dXJl");
  const cookie = [staffCookie, stateCookie && `wdza_steam_state=${stateCookie}`].filter(Boolean).join("; ");
  requestHeaders = new Headers({ cookie });
  return new NextRequest(`${ORIGIN}/api/steam/staff-link/callback?${params}`, { headers: { cookie } });
}

describe("GET /api/steam/staff-link/callback", () => {
  it("links the steamId Steam confirms to the signed-in Staff Member, and nothing else", async () => {
    const staff = await signInStaff();

    const response = await GET(callbackRequest(staff.cookie));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/admin/account?steamLink=linked`);
    await expect(getOwnSteamId(db, staff.id)).resolves.toBe(STEAM_ID);
    // Linking is not signing in as a Verified Player.
    await expect(db.select().from(verifiedPlayers)).resolves.toEqual([]);
    await expect(db.select().from(verifiedPlayerSessions)).resolves.toEqual([]);
    expect(response.headers.getSetCookie().some((c) => c.startsWith("wdza_player_session="))).toBe(false);
  });

  it("sends someone who isn't signed in as staff to sign in, linking nothing", async () => {
    const response = await GET(callbackRequest(""));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/admin/sign-in`);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a callback this browser didn't start (someone else's captured URL)", async () => {
    const staff = await signInStaff();

    const response = await GET(callbackRequest(staff.cookie, null));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/admin/account?steamLink=failed`);
    await expect(getOwnSteamId(db, staff.id)).resolves.toBeNull();
  });
});
