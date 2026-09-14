import { afterEach, describe, expect, it, vi } from "vitest";
import { createSteamClient, SteamApiError } from "./steam-client";

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchPlayerSummaries", () => {
  it("returns parsed summaries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          response: {
            players: [
              { steamid: "1", personaname: "Alice", avatarfull: "https://example.com/alice.jpg" },
            ],
          },
        }),
      ),
    );

    const client = createSteamClient("key");
    const result = await client.fetchPlayerSummaries(["1"]);

    expect(result).toEqual([
      { steamId: "1", personaName: "Alice", avatarUrl: "https://example.com/alice.jpg" },
    ]);
  });

  it("batches more than 100 steamIds into multiple calls", async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ response: { players: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    const steamIds = Array.from({ length: 150 }, (_, i) => String(i));
    const client = createSteamClient("key");
    await client.fetchPlayerSummaries(steamIds);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = new URL(fetchMock.mock.calls[0][0] as string);
    const secondUrl = new URL(fetchMock.mock.calls[1][0] as string);
    expect(firstUrl.searchParams.get("steamids")?.split(",")).toHaveLength(100);
    expect(secondUrl.searchParams.get("steamids")?.split(",")).toHaveLength(50);
  });

  it("returns an empty list without calling fetch when given no steamIds", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const client = createSteamClient("key");
    const result = await client.fetchPlayerSummaries([]);

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws SteamApiError with the retry-after header on a 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({}, { status: 429, headers: { "Retry-After": "120" } })),
    );

    const client = createSteamClient("key");

    await expect(client.fetchPlayerSummaries(["1"])).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 120,
    });
  });
});

describe("fetchPlayerAchievements", () => {
  it("returns unlocked achievements only, mapped from the raw shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          playerstats: {
            success: true,
            achievements: [
              { apiname: "THIS_IS_WARDOGS", achieved: 1, unlocktime: 1_700_000_000 },
              { apiname: "TOP_DOG", achieved: 0, unlocktime: 0 },
            ],
          },
        }),
      ),
    );

    const client = createSteamClient("key");
    const result = await client.fetchPlayerAchievements("1", 1867240);

    expect(result).toEqual({
      available: true,
      achievements: [
        { apiName: "THIS_IS_WARDOGS", unlockedAt: new Date(1_700_000_000 * 1000).toISOString() },
      ],
    });
  });

  it("treats a 400 with success:false as unavailable, not an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ playerstats: { success: false } }, { status: 400 }),
      ),
    );

    const client = createSteamClient("key");
    const result = await client.fetchPlayerAchievements("1", 1867240);

    expect(result).toEqual({ available: false });
  });

  it("treats a 403 with success:false as unavailable, not an error - Steam's actual behavior for a private profile, despite the API reference implying 400", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ playerstats: { error: "Profile is not public", success: false } }, { status: 403 }),
      ),
    );

    const client = createSteamClient("key");
    const result = await client.fetchPlayerAchievements("1", 1867240);

    expect(result).toEqual({ available: false });
  });

  it("throws SteamApiError on a 5xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { status: 500 })));

    const client = createSteamClient("key");

    await expect(client.fetchPlayerAchievements("1", 1867240)).rejects.toBeInstanceOf(
      SteamApiError,
    );
  });

  it("throws SteamApiError on a 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({}, { status: 429, headers: { "Retry-After": "60" } })),
    );

    const client = createSteamClient("key");

    await expect(client.fetchPlayerAchievements("1", 1867240)).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 60,
    });
  });
});

describe("fetchGameSchema", () => {
  it("parses the achievement schema into apiName/displayName/description/iconUrl", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          game: {
            availableGameStats: {
              achievements: [
                {
                  name: "THIS_IS_WARDOGS",
                  displayName: "This is WARDOGS",
                  description: "Play your first match.",
                  icon: "https://example.com/icon.jpg",
                },
                {
                  name: "TOP_DOG",
                  displayName: "Top Dog",
                  icon: "https://example.com/icon2.jpg",
                },
              ],
            },
          },
        }),
      ),
    );

    const client = createSteamClient("key");
    const result = await client.fetchGameSchema(1867240);

    expect(result).toEqual([
      {
        apiName: "THIS_IS_WARDOGS",
        displayName: "This is WARDOGS",
        description: "Play your first match.",
        iconUrl: "https://example.com/icon.jpg",
      },
      {
        apiName: "TOP_DOG",
        displayName: "Top Dog",
        description: null,
        iconUrl: "https://example.com/icon2.jpg",
      },
    ]);
  });
});
