import {
  challengeDefinitions,
  challengeInstances,
  createDb,
  gameEvents,
  latestSnapshots,
  matches,
  notifications,
  servers,
  staffMembers,
  verifiedPlayers,
  type Database,
} from "@wdza-stats/db";
import { eq, inArray } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { snapshotFixture } from "@/lib/live-snapshot-fixture";
import { createStaffMember } from "@/lib/staff";
import { signInVerifiedPlayer, VERIFIED_PLAYER_COOKIE } from "@/lib/verified-player";

// HomePage reads the Verified Player cookie through next/headers; there is no
// request in a test, so each test sets the cookie it wants to "arrive" with.
let playerCookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === VERIFIED_PLAYER_COOKIE && playerCookie ? { value: playerCookie } : undefined),
  }),
}));

const { default: HomePage } = await import("./page");

const db: Database = createDb(process.env.DATABASE_URL!);

const BASE_URL = process.env.RCON_BASE_URL!;

// challengeDefinitions is shared, migration-seeded config (see schema.ts) -
// other suites rely on those default rows staying in place, so this file's
// own throwaway definition is tracked here and deleted by id rather than
// blanket-deleting the whole table.
const insertedDefinitionIds: number[] = [];

afterEach(async () => {
  playerCookie = undefined;
  await db.delete(verifiedPlayers);
  await db.delete(staffMembers);
  await db.delete(notifications);
  await db.delete(gameEvents);
  await db.delete(matches);
  await db.delete(challengeInstances);
  if (insertedDefinitionIds.length > 0) {
    await db.delete(challengeDefinitions).where(inArray(challengeDefinitions.id, insertedDefinitionIds));
    insertedDefinitionIds.length = 0;
  }
  await db.delete(latestSnapshots);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

describe("HomePage", () => {
  it("renders the configured Server's latest Snapshot", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();
    await db.insert(latestSnapshots).values({
      serverId: server.id,
      capturedAt: new Date("2026-01-01T00:00:00.000Z"),
      payload: snapshotFixture({
        map: "Deadcity",
        factions: [
          { name: "Lonestar", color: "#ff0000", score: 42 },
          { name: "Valkyra", color: "#0000ff", score: 37 },
        ],
        players: [
          {
            steamId: "1",
            displayName: "Alice",
            faction: "Lonestar",
            kills: 12,
            deaths: 4,
            cash: 1500,
            ping: 38,
          },
        ],
      }),
    });

    const element = await HomePage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("WDZA Test");
    expect(html).toContain("Deadcity");
    expect(html).toContain("Lonestar");
    expect(html).toContain("#ff0000");
    expect(html).toContain("42");
    expect(html).toContain("Valkyra");
    expect(html).toContain("37");
    expect(html).toContain("Alice");
    expect(html).toContain("12");
    expect(html).toContain("4");
    expect(html).toContain("1500");
    expect(html).toContain("38");
  });

  it("renders the current and next map from the Server's rotation state", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();
    await db.insert(latestSnapshots).values({
      serverId: server.id,
      capturedAt: new Date("2026-01-01T00:00:00.000Z"),
      payload: snapshotFixture({
        map: "Deadcity",
        rotation: {
          nowIndex: 1,
          entries: [{ map: "Sandstorm" }, { map: "Deadcity" }, { map: "Frontier" }],
        },
      }),
    });

    const element = await HomePage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Rotation:");
    expect(html).toContain(">Deadcity</span> (current)");
    expect(html).toContain(">Frontier</span>");
    expect(html).toContain("(next)");
  });

  it("renders a waiting message when no live Snapshot exists yet", async () => {
    const element = await HomePage();
    const html = renderToStaticMarkup(element);

    expect(html.toLowerCase()).toContain("no live data");
  });

  it("renders active daily challenges and the recent-events feed alongside the existing live view content", async () => {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: BASE_URL })
      .returning();
    const capturedAt = new Date("2026-03-05T12:00:00.000Z");
    await db.insert(latestSnapshots).values({
      serverId: server.id,
      capturedAt,
      payload: snapshotFixture({ map: "Deadcity" }),
    });

    const [definition] = await db
      .insert(challengeDefinitions)
      .values({ type: "kills", scope: "daily", target: 20, xpReward: 150 })
      .returning();
    insertedDefinitionIds.push(definition.id);
    await db
      .insert(challengeInstances)
      .values({ definitionId: definition.id, serverId: server.id, periodKey: "2026-03-05" });

    const [match] = await db
      .insert(matches)
      .values({ serverId: server.id, map: "Deadcity", experiences: ["TeamDeathmatch"], startedAt: capturedAt })
      .returning();
    const [event] = await db
      .insert(gameEvents)
      .values({
        serverId: server.id,
        matchId: match.id,
        type: "MatchStarted",
        timestamp: capturedAt,
        idempotencyKey: "page-test-match-started",
        sourceSnapshotId: 0,
      })
      .returning();
    await db.insert(notifications).values({
      serverId: server.id,
      priority: "high",
      message: "Match started on Deadcity",
      eventId: event.id,
      timestamp: capturedAt,
    });

    const element = await HomePage();
    const html = renderToStaticMarkup(element);

    // Existing live view content is unaffected by the new sections.
    expect(html).toContain("WDZA Test");
    expect(html).toContain("Deadcity");

    expect(html).toContain("Today&#x27;s challenges");
    expect(html).toContain("Get 20 kills");
    expect(html).toContain("+150 XP");

    expect(html).toContain("Recent activity");
    expect(html).toContain("Match started on Deadcity");
  });
});

describe("HomePage KickVote panel", () => {
  async function seedTwoOnlinePlayers() {
    const [server] = await db.insert(servers).values({ name: "WDZA Test", baseUrl: BASE_URL }).returning();
    await db.insert(latestSnapshots).values({
      serverId: server.id,
      capturedAt: new Date(),
      payload: snapshotFixture({
        players: [
          { steamId: "76561198000000001", displayName: "Alice", faction: "Lonestar", kills: 0, deaths: 0, cash: 0, ping: 40 },
          { steamId: "76561198000000002", displayName: "Cheatermc", faction: "Valkyra", kills: 0, deaths: 0, cash: 0, ping: 40 },
        ],
      }),
    });
  }

  async function render() {
    return renderToStaticMarkup(await HomePage());
  }

  it("asks a signed-out visitor to sign in with Steam instead of showing the start form", async () => {
    await seedTwoOnlinePlayers();

    const html = await render();

    expect(html).toContain("Sign in with Steam");
    expect(html).not.toContain("Start KickVote");
  });

  it("tells a Verified Player who isn't on the Server that they need to be", async () => {
    await seedTwoOnlinePlayers();
    playerCookie = (await signInVerifiedPlayer(db, "76561198000000009")).token;

    const html = await render();

    expect(html).toContain("You need to be playing on this Server");
    expect(html).not.toContain("Start KickVote");
  });

  it("shows an online Verified Player the start form, without themselves as a target", async () => {
    await seedTwoOnlinePlayers();
    playerCookie = (await signInVerifiedPlayer(db, "76561198000000001")).token;

    const html = await render();

    expect(html).toContain("Start KickVote");
    expect(html).toContain('value="76561198000000002"');
    expect(html).not.toContain('value="76561198000000001"');
  });

  it("leaves Staff Members' linked steamIds out of the targets", async () => {
    await seedTwoOnlinePlayers();
    const moderator = await createStaffMember({ email: "mod@example.test", name: "Mod", password: "correct horse battery", role: "moderator" });
    await db.update(staffMembers).set({ steamId: "76561198000000002" }).where(eq(staffMembers.id, moderator.id));
    playerCookie = (await signInVerifiedPlayer(db, "76561198000000001")).token;

    const html = await render();

    expect(html).not.toContain('value="76561198000000002"');
  });
});
