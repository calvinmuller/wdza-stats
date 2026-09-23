import { afterEach, describe, expect, it, vi } from "vitest";
import { relayToWarcon } from "./warcon-relay";

const fetchMock = vi.fn();

function configure() {
  vi.stubEnv("WARCON_FEED_URL", "https://warcon.test/api/ingest/events");
  vi.stubEnv("WARCON_FEED_TOKEN", "wkf_warcon");
  vi.stubGlobal("fetch", fetchMock);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("relayToWarcon", () => {
  it("posts the raw body to Warcon with Warcon's token", async () => {
    configure();
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    const body = '{"serverId":"boot-1","events":[]}';

    await relayToWarcon(body);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://warcon.test/api/ingest/events",
      expect.objectContaining({
        method: "POST",
        body,
        headers: expect.objectContaining({
          authorization: "Bearer wkf_warcon",
        }),
      }),
    );
  });

  it("does nothing when Warcon is not configured", async () => {
    vi.stubEnv("WARCON_FEED_URL", "");
    vi.stubEnv("WARCON_FEED_TOKEN", "");
    vi.stubGlobal("fetch", fetchMock);

    await relayToWarcon("{}");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("swallows a network failure", async () => {
    configure();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(relayToWarcon("{}")).resolves.toBeUndefined();
  });
});
