import { describe, expect, it, vi } from "vitest";
import { buildSteamSignInUrl, safeReturnPath, verifySteamAssertion } from "./steam-openid";

const CALLBACK = "http://stats.test/api/steam/callback";
const STEAM_ID = "76561198000000001";

// What Steam appends to our return URL after a successful sign-in.
function assertion(overrides: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({
    returnTo: "/kick/1",
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "id_res",
    "openid.op_endpoint": "https://steamcommunity.com/openid/login",
    "openid.claimed_id": `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    "openid.identity": `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    "openid.return_to": `${CALLBACK}?returnTo=%2Fkick%2F1`,
    "openid.response_nonce": "2026-09-23T10:00:00Zabc",
    "openid.assoc_handle": "1234567890",
    "openid.signed": "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
    "openid.sig": "c2lnbmF0dXJl",
    ...overrides,
  });
}

function steamSays(body: string) {
  return vi.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe("buildSteamSignInUrl", () => {
  it("asks Steam to pick the identity and come back to our callback", () => {
    const url = new URL(buildSteamSignInUrl("http://stats.test", `${CALLBACK}?returnTo=%2F`));
    expect(url.origin + url.pathname).toBe("https://steamcommunity.com/openid/login");
    expect(url.searchParams.get("openid.mode")).toBe("checkid_setup");
    expect(url.searchParams.get("openid.realm")).toBe("http://stats.test");
    expect(url.searchParams.get("openid.return_to")).toBe(`${CALLBACK}?returnTo=%2F`);
  });
});

describe("verifySteamAssertion", () => {
  it("returns the steamId once Steam confirms the assertion", async () => {
    const fetchImpl = steamSays("ns:http://specs.openid.net/auth/2.0\nis_valid:true\n");

    await expect(verifySteamAssertion(assertion(), CALLBACK, fetchImpl)).resolves.toBe(STEAM_ID);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://steamcommunity.com/openid/login");
    const sent = new URLSearchParams(init.body as URLSearchParams);
    expect(sent.get("openid.mode")).toBe("check_authentication");
    expect(sent.get("openid.sig")).toBe("c2lnbmF0dXJl");
    // Our own query parameters aren't part of the assertion.
    expect(sent.has("returnTo")).toBe(false);
  });

  it("rejects an assertion Steam says is not valid (forged or replayed)", async () => {
    const fetchImpl = steamSays("ns:http://specs.openid.net/auth/2.0\nis_valid:false\n");
    await expect(verifySteamAssertion(assertion(), CALLBACK, fetchImpl)).resolves.toBeNull();
  });

  it.each([
    ["a cancelled sign-in", { "openid.mode": "cancel" }],
    ["another OpenID provider", { "openid.op_endpoint": "https://evil.example/openid" }],
    ["an assertion meant for another site", { "openid.return_to": "https://evil.example/api/steam/callback" }],
    ["a claimed id that isn't a Steam id", { "openid.claimed_id": "https://evil.example/id/1", "openid.identity": "https://evil.example/id/1" }],
    ["a claimed id with a trailing path", { "openid.claimed_id": `https://steamcommunity.com/openid/id/${STEAM_ID}/x`, "openid.identity": `https://steamcommunity.com/openid/id/${STEAM_ID}/x` }],
    ["an identity that differs from the claimed id", { "openid.identity": "https://steamcommunity.com/openid/id/76561198000000002" }],
  ])("rejects %s without asking Steam", async (_label, overrides) => {
    const fetchImpl = steamSays("is_valid:true\n");
    await expect(verifySteamAssertion(assertion(overrides), CALLBACK, fetchImpl)).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("treats Steam being unreachable as a failed sign-in", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await expect(verifySteamAssertion(assertion(), CALLBACK, fetchImpl)).resolves.toBeNull();
  });
});

describe("safeReturnPath", () => {
  it.each([
    ["/kick/12", "/kick/12"],
    ["/players/1?server=2#top", "/players/1?server=2#top"],
    [null, "/"],
    ["", "/"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["/\t/evil.example", "/"],
    ["javascript:alert(1)", "/"],
  ])("%j -> %j", (raw, expected) => {
    expect(safeReturnPath(raw)).toBe(expected);
  });
});
