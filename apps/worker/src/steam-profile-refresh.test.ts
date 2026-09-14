import { createDb, steamAchievementSchema, steamProfiles, type Database } from "@wdza-stats/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { refreshPlaytimeOnJoin, refreshUnseenSteamProfiles } from "./steam-profile-refresh";
import { scriptedSteamClient } from "./steam-fixture";

const APP_ID = 1867240;
const db: Database = createDb(process.env.DATABASE_URL!);

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete(steamProfiles);
  await db.delete(steamAchievementSchema);
});

afterAll(async () => {
  await db.$client.end();
});

async function readProfile(steamId: string) {
  const [row] = await db.select().from(steamProfiles).where(eq(steamProfiles.steamId, steamId));
  return row;
}

describe("refreshUnseenSteamProfiles", () => {
  it("caches a fresh player's persona name, avatar, and achievements as ok", async () => {
    const client = scriptedSteamClient({
      summaries: { "1": { steamId: "1", personaName: "Alice", avatarUrl: "https://example.com/a.jpg" } },
      achievements: {
        "1": { available: true, achievements: [{ apiName: "THIS_IS_WARDOGS", unlockedAt: "2026-09-10T00:00:00.000Z" }] },
      },
    });

    await refreshUnseenSteamProfiles(db, client, APP_ID, ["1"]);

    const row = await readProfile("1");
    expect(row).toMatchObject({
      steamId: "1",
      personaName: "Alice",
      avatarUrl: "https://example.com/a.jpg",
      status: "ok",
      achievements: [{ apiName: "THIS_IS_WARDOGS", unlockedAt: "2026-09-10T00:00:00.000Z" }],
    });
  });

  it("logs each newly-cached profile with its status and playtime", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const client = scriptedSteamClient({
      summaries: { "1": { steamId: "1", personaName: "Alice", avatarUrl: "https://example.com/a.jpg" } },
      achievements: { "1": { available: true, achievements: [] } },
      playtimeMinutes: { "1": 90 },
    });

    await refreshUnseenSteamProfiles(db, client, APP_ID, ["1"]);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[worker] cached Steam profile for 1: status=ok"),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("playtime=90 min"));
    logSpy.mockRestore();
  });

  it("caches playtime alongside achievements", async () => {
    const client = scriptedSteamClient({
      summaries: { "1": { steamId: "1", personaName: "Alice", avatarUrl: "https://example.com/a.jpg" } },
      achievements: { "1": { available: true, achievements: [] } },
      playtimeMinutes: { "1": 4321 },
    });

    await refreshUnseenSteamProfiles(db, client, APP_ID, ["1"]);

    const row = await readProfile("1");
    expect(row).toMatchObject({ playtimeMinutes: 4321 });
  });

  it("caches a null playtime without affecting the achievements-derived status", async () => {
    const client = scriptedSteamClient({
      summaries: { "1": { steamId: "1", personaName: "Alice", avatarUrl: "https://example.com/a.jpg" } },
      achievements: { "1": { available: true, achievements: [] } },
    });

    await refreshUnseenSteamProfiles(db, client, APP_ID, ["1"]);

    const row = await readProfile("1");
    expect(row).toMatchObject({ status: "ok", playtimeMinutes: null });
  });

  it("caches a null playtime, without throwing, when the playtime fetch fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const client = scriptedSteamClient({
      summaries: { "1": { steamId: "1", personaName: "Alice", avatarUrl: "https://example.com/a.jpg" } },
      achievements: { "1": { available: true, achievements: [] } },
      failPlaytime: () => new Error("network error"),
    });

    await expect(refreshUnseenSteamProfiles(db, client, APP_ID, ["1"])).resolves.toBeUndefined();

    const row = await readProfile("1");
    expect(row).toMatchObject({ status: "ok", playtimeMinutes: null });
  });

  it("caches persona name/avatar with status private when achievements are unavailable", async () => {
    const client = scriptedSteamClient({
      summaries: { "1": { steamId: "1", personaName: "Alice", avatarUrl: "https://example.com/a.jpg" } },
      achievements: { "1": { available: false } },
    });

    await refreshUnseenSteamProfiles(db, client, APP_ID, ["1"]);

    const row = await readProfile("1");
    expect(row).toMatchObject({
      personaName: "Alice",
      avatarUrl: "https://example.com/a.jpg",
      status: "private",
      achievements: [],
    });
  });

  it("does not re-fetch a player already cached as ok", async () => {
    const client = scriptedSteamClient({
      summaries: { "1": { steamId: "1", personaName: "Alice", avatarUrl: "https://example.com/a.jpg" } },
      achievements: { "1": { available: true, achievements: [] } },
    });

    await refreshUnseenSteamProfiles(db, client, APP_ID, ["1"]);
    await refreshUnseenSteamProfiles(db, client, APP_ID, ["1"]);

    expect(client.summariesCalls).toHaveLength(1);
    expect(client.achievementsCalls).toHaveLength(1);
  });

  it("does not re-fetch a player cached as private", async () => {
    const client = scriptedSteamClient({
      summaries: { "1": { steamId: "1", personaName: "Alice", avatarUrl: "https://example.com/a.jpg" } },
      achievements: { "1": { available: false } },
    });

    await refreshUnseenSteamProfiles(db, client, APP_ID, ["1"]);
    await refreshUnseenSteamProfiles(db, client, APP_ID, ["1"]);

    expect(client.summariesCalls).toHaveLength(1);
  });

  it("marks a player error when the summaries fetch fails, without throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const client = scriptedSteamClient({
      failSummaries: () => new Error("network error"),
    });

    await expect(refreshUnseenSteamProfiles(db, client, APP_ID, ["1"])).resolves.toBeUndefined();

    const row = await readProfile("1");
    expect(row).toMatchObject({ status: "error", personaName: null, avatarUrl: null });
  });

  it("retries a previously-errored player on next sighting once the cooldown has passed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await db.insert(steamProfiles).values({
      steamId: "1",
      personaName: null,
      avatarUrl: null,
      achievements: [],
      status: "error",
      fetchedAt: new Date(Date.now() - 61_000),
    });

    const client = scriptedSteamClient({
      summaries: { "1": { steamId: "1", personaName: "Alice", avatarUrl: "https://example.com/a.jpg" } },
      achievements: { "1": { available: true, achievements: [] } },
    });

    await refreshUnseenSteamProfiles(db, client, APP_ID, ["1"]);

    expect(client.summariesCalls).toHaveLength(1);
    const row = await readProfile("1");
    expect(row).toMatchObject({ status: "ok", personaName: "Alice" });
  });

  it("does not retry a recently-errored player within the cooldown", async () => {
    await db.insert(steamProfiles).values({
      steamId: "1",
      personaName: null,
      avatarUrl: null,
      achievements: [],
      status: "error",
      fetchedAt: new Date(),
    });

    const client = scriptedSteamClient({
      summaries: { "1": { steamId: "1", personaName: "Alice", avatarUrl: "https://example.com/a.jpg" } },
      achievements: { "1": { available: true, achievements: [] } },
    });

    await refreshUnseenSteamProfiles(db, client, APP_ID, ["1"]);

    expect(client.summariesCalls).toHaveLength(0);
  });

  it("does not block other players when one player's achievements fetch fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const client = scriptedSteamClient({
      summaries: {
        "1": { steamId: "1", personaName: "Alice", avatarUrl: "https://example.com/a.jpg" },
        "2": { steamId: "2", personaName: "Bob", avatarUrl: "https://example.com/b.jpg" },
      },
      achievements: { "2": { available: true, achievements: [] } },
      failAchievements: (steamId) => (steamId === "1" ? new Error("network error") : null),
    });

    await refreshUnseenSteamProfiles(db, client, APP_ID, ["1", "2"]);

    const alice = await readProfile("1");
    const bob = await readProfile("2");
    expect(alice).toMatchObject({ status: "error", personaName: "Alice" });
    expect(bob).toMatchObject({ status: "ok", personaName: "Bob" });
  });

  it("fetches and caches the achievement schema once, not per player", async () => {
    const client = scriptedSteamClient({
      summaries: {
        "1": { steamId: "1", personaName: "Alice", avatarUrl: "https://example.com/a.jpg" },
        "2": { steamId: "2", personaName: "Bob", avatarUrl: "https://example.com/b.jpg" },
      },
      achievements: {
        "1": { available: true, achievements: [] },
        "2": { available: true, achievements: [] },
      },
      schema: [
        { apiName: "THIS_IS_WARDOGS", displayName: "This is WARDOGS", description: null, iconUrl: "https://example.com/icon.jpg" },
      ],
    });

    await refreshUnseenSteamProfiles(db, client, APP_ID, ["1", "2"]);

    const rows = await db.select().from(steamAchievementSchema);
    expect(rows).toHaveLength(1);
  });

  it("dedupes repeated steamIds in the input list", async () => {
    const client = scriptedSteamClient({
      summaries: { "1": { steamId: "1", personaName: "Alice", avatarUrl: "https://example.com/a.jpg" } },
      achievements: { "1": { available: true, achievements: [] } },
    });

    await refreshUnseenSteamProfiles(db, client, APP_ID, ["1", "1", "1"]);

    expect(client.summariesCalls).toEqual([["1"]]);
  });

  it("reports progress once per targeted player, against the targeted count not the input count", async () => {
    const client = scriptedSteamClient({
      summaries: {
        "1": { steamId: "1", personaName: "Alice", avatarUrl: "https://example.com/a.jpg" },
        "2": { steamId: "2", personaName: "Bob", avatarUrl: "https://example.com/b.jpg" },
      },
      achievements: {
        "1": { available: true, achievements: [] },
        "2": { available: true, achievements: [] },
      },
    });
    const progress: Array<[number, number]> = [];

    await refreshUnseenSteamProfiles(db, client, APP_ID, ["1", "2"], (done, total) =>
      progress.push([done, total]),
    );

    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });
});

describe("refreshPlaytimeOnJoin", () => {
  it("re-fetches playtime for an already-cached ok player", async () => {
    await db.insert(steamProfiles).values({
      steamId: "1",
      personaName: "Alice",
      avatarUrl: null,
      achievements: [],
      playtimeMinutes: 100,
      status: "ok",
      fetchedAt: new Date(),
    });
    const client = scriptedSteamClient({ playtimeMinutes: { "1": 250 } });

    await refreshPlaytimeOnJoin(db, client, APP_ID, ["1"]);

    expect(client.playtimeCalls).toEqual(["1"]);
    const row = await readProfile("1");
    expect(row).toMatchObject({ playtimeMinutes: 250 });
  });

  it("re-fetches playtime for an already-cached private player", async () => {
    await db.insert(steamProfiles).values({
      steamId: "1",
      personaName: "Alice",
      avatarUrl: null,
      achievements: [],
      playtimeMinutes: null,
      status: "private",
      fetchedAt: new Date(),
    });
    const client = scriptedSteamClient({ playtimeMinutes: { "1": 60 } });

    await refreshPlaytimeOnJoin(db, client, APP_ID, ["1"]);

    expect(client.playtimeCalls).toEqual(["1"]);
    const row = await readProfile("1");
    expect(row).toMatchObject({ playtimeMinutes: 60 });
  });

  it("does not fetch for a steamId with no cached SteamProfile row", async () => {
    const client = scriptedSteamClient({ playtimeMinutes: { "1": 999 } });

    await refreshPlaytimeOnJoin(db, client, APP_ID, ["1"]);

    expect(client.playtimeCalls).toEqual([]);
    const row = await readProfile("1");
    expect(row).toBeUndefined();
  });

  it("does not fetch for a steamId cached as error - left to refreshUnseenSteamProfiles's own retry", async () => {
    await db.insert(steamProfiles).values({
      steamId: "1",
      personaName: null,
      avatarUrl: null,
      achievements: [],
      status: "error",
      fetchedAt: new Date(),
    });
    const client = scriptedSteamClient({ playtimeMinutes: { "1": 999 } });

    await refreshPlaytimeOnJoin(db, client, APP_ID, ["1"]);

    expect(client.playtimeCalls).toEqual([]);
  });

  it("does not block other players when one player's playtime fetch fails, and does not throw", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await db.insert(steamProfiles).values([
      { steamId: "1", personaName: "Alice", avatarUrl: null, achievements: [], status: "ok", fetchedAt: new Date() },
      { steamId: "2", personaName: "Bob", avatarUrl: null, achievements: [], status: "ok", fetchedAt: new Date() },
    ]);
    const client = scriptedSteamClient({
      playtimeMinutes: { "2": 400 },
      failPlaytime: (steamId) => (steamId === "1" ? new Error("network error") : null),
    });

    await expect(refreshPlaytimeOnJoin(db, client, APP_ID, ["1", "2"])).resolves.toBeUndefined();

    const alice = await readProfile("1");
    const bob = await readProfile("2");
    expect(alice).toMatchObject({ playtimeMinutes: null });
    expect(bob).toMatchObject({ playtimeMinutes: 400 });
  });

  it("does nothing when given no steamIds", async () => {
    const client = scriptedSteamClient({});

    await expect(refreshPlaytimeOnJoin(db, client, APP_ID, [])).resolves.toBeUndefined();

    expect(client.playtimeCalls).toEqual([]);
  });
});
