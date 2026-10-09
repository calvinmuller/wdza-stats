import {
  createDb,
  currentSeason,
  kills,
  latestSnapshots,
  matches,
  playerCareerStats,
  playerSeasonStats,
  servers,
  verifiedPlayers,
  type Database,
} from "@wdza-stats/db";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { snapshotFixture } from "@/lib/live-snapshot-fixture";
import { signInVerifiedPlayer, VERIFIED_PLAYER_COOKIE } from "@/lib/verified-player";

// HomePage reads the Verified Player cookie through next/headers; there is
// no request in a test, so each test sets what it wants to "arrive" with.
let playerCookie: string | undefined;
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) => (name === VERIFIED_PLAYER_COOKIE && playerCookie ? { value: playerCookie } : undefined),
  }),
}));

const { default: HomePage } = await import("./page");

const db: Database = createDb(process.env.DATABASE_URL!);

afterEach(async () => {
  playerCookie = undefined;
  await db.delete(verifiedPlayers);
  await db.delete(kills);
  await db.delete(matches);
  await db.delete(playerSeasonStats);
  await db.delete(playerCareerStats);
  await db.delete(latestSnapshots);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

const render = async () => renderToStaticMarkup(await HomePage());

async function addServer(slug: string, name = slug) {
  const [server] = await db.insert(servers).values({ name, slug, baseUrl: `http://${slug}.test:9103` }).returning();
  return server;
}

describe("HomePage", () => {
  it("shows the only Server's card instead of going straight to it", async () => {
    const server = await addServer("only", "WDZA Only");
    await db.insert(latestSnapshots).values({
      serverId: server.id,
      capturedAt: new Date("2026-01-01T00:00:00.000Z"),
      payload: snapshotFixture({
        map: "Deadcity",
        rotation: { nowIndex: 0, entries: [{ map: "Deadcity" }, { map: "Kavkazi" }] },
        factions: [
          { name: "Lonestar", color: "#ff0000", score: 42 },
          { name: "Valkyra", color: "#0000ff", score: 37 },
        ],
      }),
    });

    const html = await render();

    expect(html).toContain('href="/servers/only"');
    expect(html).toContain("WDZA Only");
    expect(html).toContain("Deadcity");
    expect(html).toContain("Kavkazi");
    expect(html).toContain("Lonestar");
    expect(html).toContain("42");
    expect(html).toContain("Valkyra");
  });

  it("puts the Season's Podium first, each place linking to the player's overview", async () => {
    const alpha = await addServer("alpha");
    const season = await currentSeason(db);
    await db.insert(playerCareerStats).values({ serverId: alpha.id, steamId: "76561198000000001", displayName: "Alice", xp: 900 });
    await db.insert(playerSeasonStats).values({
      seasonId: season.id,
      serverId: alpha.id,
      steamId: "76561198000000001",
      xp: 900,
      kills: 12,
      matchesPlayed: 1,
    });

    const html = await render();

    expect(html).toContain(`Season ${season.number}`);
    expect(html).toContain("Alice");
    expect(html).toContain('href="/players/76561198000000001"');
  });

  it("says the Season has just started when nobody has played a Match in it", async () => {
    await addServer("alpha");
    const season = await currentSeason(db);

    expect(await render()).toContain(`Season ${season.number} has just started`);
  });

  it("shows the Season's most-used weapons across every Server", async () => {
    const alpha = await addServer("alpha");
    const season = await currentSeason(db);
    const [match] = await db
      .insert(matches)
      .values({ serverId: alpha.id, seasonId: season.id, map: "Kavkazi", experiences: [], startedAt: new Date() })
      .returning();
    await db.insert(kills).values({
      serverId: alpha.id,
      matchRow: match.id,
      eventId: "home-1",
      instanceId: "boot",
      gameMatchId: "game-match",
      eventTime: 1,
      map: "Kavkazi",
      killerSteamId: "1",
      killerName: "Alice",
      victimSteamId: "2",
      victimName: "Bob",
      cause: "Id.Item.SVDM",
      tags: [],
    });

    const html = await render();

    expect(html).toContain("Top weapons");
    expect(html).toContain("SVD");
  });

  it("asks a signed-out visitor to link Steam, but not a Verified Player", async () => {
    await addServer("alpha");

    expect(await render()).toContain("/api/steam/sign-in?returnTo=%2F");

    playerCookie = (await signInVerifiedPlayer(db, "76561198000000009")).token;
    expect(await render()).not.toContain("/api/steam/sign-in");
  });
});
