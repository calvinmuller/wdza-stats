import { createDb, latestSnapshots, matches, servers, type Database } from "@wdza-stats/db";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import LegacyMatchPage from "@/app/matches/[id]/page";
import LegacyStatsPage from "@/app/stats/page";
import { snapshotFixture } from "./live-snapshot-fixture";
import { getPublicServerBySlug, getServerDirectory, redirectToDefaultServer, resolveApiServer } from "./server-lookup";
import { parseServerPath, serverPath } from "./server-path";

const db: Database = createDb(process.env.DATABASE_URL!);

afterEach(async () => {
  await db.delete(latestSnapshots);
  await db.delete(matches);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

// Where a redirect() thrown by a page or helper was sending the visitor.
async function redirectedTo(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT")) return digest.split(";")[2];
    throw error;
  }
  throw new Error("expected a redirect");
}

async function seedServers() {
  return db
    .insert(servers)
    .values([
      { name: "First", slug: "first", baseUrl: "http://first.test:9006" },
      { name: "Second", slug: "second", baseUrl: "http://second.test:9006" },
      { name: "Retired", slug: "retired", baseUrl: "http://retired.test:9006", enabled: false },
    ])
    .returning();
}

describe("serverPath and parseServerPath", () => {
  it("build and read back /servers/{slug} paths", () => {
    expect(serverPath("wdza", "/stats")).toBe("/servers/wdza/stats");
    expect(parseServerPath("/servers/wdza/players/1")).toEqual({ slug: "wdza", rest: "/players/1" });
    expect(parseServerPath("/servers/wdza")).toEqual({ slug: "wdza", rest: "" });
    expect(parseServerPath("/admin")).toBeNull();
  });
});

describe("getPublicServerBySlug", () => {
  it("finds an enabled Server and never a disabled one", async () => {
    await seedServers();

    expect(await getPublicServerBySlug(db, "second")).toMatchObject({ name: "Second" });
    expect(await getPublicServerBySlug(db, "retired")).toBeUndefined();
  });
});

describe("resolveApiServer", () => {
  it("uses ?server= when given, and the default Server otherwise", async () => {
    await seedServers();

    expect(await resolveApiServer(db, new URLSearchParams("server=second"))).toMatchObject({ slug: "second" });
    expect(await resolveApiServer(db, new URLSearchParams())).toMatchObject({ slug: "first" });
  });

  it("is a 404 for a slug no enabled Server has", async () => {
    await seedServers();

    const result = await resolveApiServer(db, new URLSearchParams("server=retired"));

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(404);
  });
});

describe("redirectToDefaultServer", () => {
  it("sends an old URL to the default Server's page, keeping the query string", async () => {
    await seedServers();

    expect(await redirectedTo(() => redirectToDefaultServer(db, "/leaderboard", { sort: "cash", season: "2" }))).toBe(
      "/servers/first/leaderboard?sort=cash&season=2",
    );
    expect(await redirectedTo(() => LegacyStatsPage({ searchParams: Promise.resolve({}) }))).toBe("/servers/first/stats");
  });

  it("sends an old Match URL to the Match's own Server", async () => {
    const [, second] = await seedServers();
    const [match] = await db
      .insert(matches)
      .values({ serverId: second.id, map: "Foundry", experiences: [], startedAt: new Date() })
      .returning();

    expect(await redirectedTo(() => LegacyMatchPage({ params: Promise.resolve({ id: String(match.id) }) }))).toBe(
      `/servers/second/matches/${match.id}`,
    );
  });
});

describe("getServerDirectory", () => {
  it("shows each enabled Server's map, rotation and faction scores from its latest Snapshot", async () => {
    const [first] = await seedServers();
    await db.insert(latestSnapshots).values({
      serverId: first.id,
      capturedAt: new Date("2026-01-01T00:00:00.000Z"),
      payload: snapshotFixture({
        map: "Deadcity",
        lighting: "Night",
        rotation: { nowIndex: 1, entries: [{ map: "Sandstorm" }, { map: "Deadcity" }, { map: "Kavkazi" }] },
        factions: [
          { name: "Lonestar", color: "#ff0000", score: 12 },
          { name: "Valkyra", color: "#0000ff", score: 37 },
        ],
        players: [
          { steamId: "1", displayName: "Alice", faction: "Lonestar", kills: 3, deaths: 4, cash: 0, ping: 40 },
          { steamId: "2", displayName: "Bob", faction: "Valkyra", kills: 9, deaths: 1, cash: 0, ping: 40 },
          { steamId: "3", displayName: "Carol", faction: "Manticore", kills: 3, deaths: 2, cash: 0, ping: 40 },
        ],
        playerSlots: { current: 2, max: 64 },
      }),
    });

    const directory = await getServerDirectory(db);

    expect(directory.map((server) => server.slug)).toEqual(["first", "second"]);
    expect(directory[0].live).toEqual({
      map: "Deadcity",
      lighting: "Night",
      playerCount: 3,
      maxPlayers: 64,
      capturedAt: "2026-01-01T00:00:00.000Z",
      rotation: { current: "Deadcity", next: "Kavkazi" },
      // Leader first.
      factions: [
        { name: "Valkyra", color: "#0000ff", score: 37 },
        { name: "Lonestar", color: "#ff0000", score: 12 },
      ],
      // Most kills first, then fewest deaths; no color for a Faction the Snapshot doesn't list.
      players: [
        { steamId: "2", displayName: "Bob", factionColor: "#0000ff", kills: 9, deaths: 1 },
        { steamId: "3", displayName: "Carol", factionColor: null, kills: 3, deaths: 2 },
        { steamId: "1", displayName: "Alice", factionColor: "#ff0000", kills: 3, deaths: 4 },
      ],
    });
    expect(directory[1].live).toBeNull();
  });
});
