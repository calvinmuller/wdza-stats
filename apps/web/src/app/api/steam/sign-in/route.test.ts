import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/steam/sign-in", () => {
  it("sends the browser to Steam with a state that matches the cookie it sets", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "http://stats.test");

    const response = await GET(new Request("http://stats.test/api/steam/sign-in?returnTo=%2Fkick%2F3"));

    const steam = new URL(response.headers.get("location")!);
    expect(steam.origin).toBe("https://steamcommunity.com");
    const returnTo = new URL(steam.searchParams.get("openid.return_to")!);
    expect(returnTo.origin + returnTo.pathname).toBe("http://stats.test/api/steam/callback");
    expect(returnTo.searchParams.get("returnTo")).toBe("/kick/3");

    const cookie = response.headers.getSetCookie().find((c) => c.startsWith("wdza_steam_state="))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie.split(";")[0]).toBe(`wdza_steam_state=${returnTo.searchParams.get("state")}`);
  });
});
