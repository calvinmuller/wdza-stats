import { afterEach, describe, expect, it, vi } from "vitest";
import { createRconClient } from "./rcon-client";

function okResponse() {
  return new Response(null, { status: 200 });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("kickPlayer", () => {
  it("POSTs to /v1/players/{steamId}/kick with the bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const client = createRconClient("http://rcon.test", "secret-token");

    await client.kickPlayer("12345");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://rcon.test/v1/players/12345/kick");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer secret-token");
  });

  it("throws when the RCON API rejects the kick", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    const client = createRconClient("http://rcon.test", "secret-token");

    await expect(client.kickPlayer("12345")).rejects.toThrow(/failed with status 500/);
  });
});

describe("broadcast", () => {
  it("POSTs to /v1/broadcast with the message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const client = createRconClient("http://rcon.test", "secret-token");

    await client.broadcast("Kick vote started");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://rcon.test/v1/broadcast");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ message: "Kick vote started" });
  });
});
