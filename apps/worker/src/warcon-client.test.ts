import { afterEach, describe, expect, it, vi } from "vitest";
import { createWarconClient, type WarconListEntry } from "./warcon-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

function entry(overrides: Partial<WarconListEntry>): WarconListEntry {
  return {
    steamId: "1",
    name: "Player",
    reason: "",
    expiresAt: null,
    expired: false,
    addedAt: "2026-10-07T09:00:00.000Z",
    removedAt: null,
    ...overrides,
  };
}

describe("fetchBans", () => {
  it("GETs the org's ban list with the API key as bearer token", async () => {
    const active = entry({ steamId: "1", reason: "Cheating" });
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true, entries: [active] }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createWarconClient("https://warcon.test", "wck_test", "org-1");

    await expect(client.fetchBans()).resolves.toEqual([active]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://warcon.test/api/orgs/org-1/lists/ban/entries");
    expect(init.headers.Authorization).toBe("Bearer wck_test");
  });

  it("leaves out removed and expired bans", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          ok: true,
          entries: [
            entry({ steamId: "1" }),
            entry({ steamId: "2", removedAt: "2026-10-07T10:00:00.000Z" }),
            entry({ steamId: "3", expired: true, expiresAt: "2026-10-07T10:00:00.000Z" }),
          ],
        }),
      ),
    );
    const client = createWarconClient("https://warcon.test", "wck_test", "org-1");

    expect((await client.fetchBans()).map((ban) => ban.steamId)).toEqual(["1"]);
  });

  it("throws when Warcon rejects the request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    const client = createWarconClient("https://warcon.test", "wck_test", "org-1");

    await expect(client.fetchBans()).rejects.toThrow(/failed with status 403/);
  });
});

describe("fetchReservedSlots", () => {
  it("GETs the org's reserved-slot list, leaving out removed entries", async () => {
    const active = entry({ steamId: "1", reason: "member @alice" });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ ok: true, entries: [active, entry({ steamId: "2", removedAt: "2026-10-07T10:00:00.000Z" })] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = createWarconClient("https://warcon.test", "wck_test", "org-1");

    await expect(client.fetchReservedSlots()).resolves.toEqual([active]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://warcon.test/api/orgs/org-1/lists/reserve/entries");
    expect(init.headers.Authorization).toBe("Bearer wck_test");
  });
});
