import { describe, expect, it } from "vitest";
import { getRotationPreview } from "./snapshot";

describe("getRotationPreview", () => {
  it("returns the entry at nowIndex as current and the following entry as next", () => {
    const result = getRotationPreview({
      nowIndex: 0,
      entries: [{ map: "Sandstorm" }, { map: "Deadcity" }],
    });

    expect(result).toEqual({ current: "Sandstorm", next: "Deadcity" });
  });

  it("wraps around to the first entry after the last one", () => {
    const result = getRotationPreview({
      nowIndex: 1,
      entries: [{ map: "Sandstorm" }, { map: "Deadcity" }],
    });

    expect(result).toEqual({ current: "Deadcity", next: "Sandstorm" });
  });

  it("returns the same map for both current and next when the rotation has one entry", () => {
    const result = getRotationPreview({
      nowIndex: 0,
      entries: [{ map: "Sandstorm" }],
    });

    expect(result).toEqual({ current: "Sandstorm", next: "Sandstorm" });
  });

  it("returns nulls when the rotation has no entries yet", () => {
    const result = getRotationPreview({ nowIndex: 0, entries: [] });

    expect(result).toEqual({ current: null, next: null });
  });

  it("returns nulls for a stored payload that predates the entries field", () => {
    // Snapshot payloads are stored as untyped jsonb, so a row persisted by
    // an older Worker build can lack `entries` even though the type now
    // requires it - this must not throw.
    const legacyRotation = { nowIndex: 0 } as unknown as {
      nowIndex: number;
      entries: { map: string }[];
    };

    const result = getRotationPreview(legacyRotation);

    expect(result).toEqual({ current: null, next: null });
  });
});
