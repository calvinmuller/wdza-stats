import { SNAPSHOT_POLL_INTERVAL_MS } from "@wdza-stats/db/snapshot";
import { describe, expect, it } from "vitest";
import { REFRESH_INTERVAL_MS } from "./live-server";

describe("REFRESH_INTERVAL_MS", () => {
  it("polls no faster than the Worker's own Snapshot ingestion cadence", () => {
    expect(REFRESH_INTERVAL_MS).toBe(SNAPSHOT_POLL_INTERVAL_MS);
  });
});
