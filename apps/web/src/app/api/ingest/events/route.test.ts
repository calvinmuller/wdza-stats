import { createHash } from "node:crypto";
import {
  createDb,
  kills,
  latestSnapshots,
  matches,
  servers,
  type Database,
} from "@wdza-stats/db";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { snapshotFixture } from "@/lib/live-snapshot-fixture";
import { getRecentKills } from "@/lib/recent-kills";
import { POST } from "./route";

const db: Database = createDb(process.env.DATABASE_URL!);

afterEach(async () => {
  await db.delete(kills);
  await db.delete(latestSnapshots);
  await db.delete(matches);
  await db.delete(servers);
});

afterAll(async () => {
  await db.$client.end();
});

function feedRequest(body: unknown, token?: string): Request {
  return new Request("http://localhost/api/ingest/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const FEED_TOKEN = "wkf_" + "a".repeat(43);

async function serverWithFeedToken(token = FEED_TOKEN) {
  const [server] = await db
    .insert(servers)
    .values({
      name: "WDZA Test",
      baseUrl: "http://rcon.test",
      feedTokenHash: createHash("sha256").update(token).digest("hex"),
    })
    .returning();
  return server;
}

function killedEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "11111111-1111-1111-1111-111111111111",
    type: "killed",
    eventTime: 3317.77,
    matchId: "22222222-2222-2222-2222-222222222222",
    mapName: "Kavkazi",
    killerName: "Alice",
    killerId: "k1",
    killerSteamId: "76561198000000001",
    victimName: "Bob",
    victimId: "v1",
    victimSteamId: "76561198000000002",
    cause: "Id.Item.AK74M",
    distance: 70487,
    contextTags: [
      "Meta.Progression.Context.Player.KillContext.Headshot",
      "Meta.PlayerKillFlag.Player.Local.Kill",
      "Meta.PlayerKillFlag.Player.Local.Death",
    ],
    ...overrides,
  };
}

function batch(events: unknown[]) {
  return { serverId: "boot-1", serverName: "WDZA Test", events };
}

describe("POST /api/ingest/events", () => {
  it("rejects a batch with no token", async () => {
    const response = await POST(feedRequest({ events: [] }));

    expect(response.status).toBe(401);
  });

  it("rejects a batch with a token that belongs to no Server", async () => {
    const response = await POST(
      feedRequest({ events: [] }, "wkf_" + "x".repeat(43)),
    );

    expect(response.status).toBe(401);
  });

  it("accepts a killed event from a Server's token", async () => {
    await serverWithFeedToken();

    const response = await POST(
      feedRequest(batch([killedEvent()]), FEED_TOKEN),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      accepted: 1,
      skipped: 0,
      duplicates: 0,
    });
  });

  it("stores an accepted kill so it can be read back", async () => {
    const server = await serverWithFeedToken();

    await POST(feedRequest(batch([killedEvent()]), FEED_TOKEN));

    const recent = await getRecentKills(db, server.id, { limit: 20 });
    expect(recent).toEqual([
      expect.objectContaining({
        id: expect.any(Number),
        map: "Kavkazi",
        eventTime: 3317.77,
        killerSteamId: "76561198000000001",
        killerName: "Alice",
        victimSteamId: "76561198000000002",
        victimName: "Bob",
        cause: "Id.Item.AK74M",
        distanceM: 704.87,
      }),
    ]);
  });

  it("counts a resent event as a duplicate and stores it once", async () => {
    const server = await serverWithFeedToken();
    await POST(feedRequest(batch([killedEvent()]), FEED_TOKEN));

    const response = await POST(
      feedRequest(batch([killedEvent()]), FEED_TOKEN),
    );

    expect(await response.json()).toEqual({
      ok: true,
      accepted: 0,
      skipped: 0,
      duplicates: 1,
    });
    expect(await getRecentKills(db, server.id, { limit: 20 })).toHaveLength(1);
  });

  it("skips events that are not kills without failing the batch", async () => {
    const server = await serverWithFeedToken();

    const response = await POST(
      feedRequest(
        batch([
          { eventId: "e-other", type: "respawned", eventTime: 1 },
          killedEvent(),
        ]),
        FEED_TOKEN,
      ),
    );

    expect(await response.json()).toEqual({
      ok: true,
      accepted: 1,
      skipped: 1,
      duplicates: 0,
    });
    expect(await getRecentKills(db, server.id, { limit: 20 })).toHaveLength(1);
  });

  it("rejects a body that is not JSON", async () => {
    await serverWithFeedToken();
    const request = new Request("http://localhost/api/ingest/events", {
      method: "POST",
      headers: { authorization: `Bearer ${FEED_TOKEN}` },
      body: "{not json",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("rejects a body that is not a batch of events", async () => {
    await serverWithFeedToken();

    const response = await POST(feedRequest({ hello: "world" }, FEED_TOKEN));

    expect(response.status).toBe(400);
  });

  it("rejects a body over 64 KB", async () => {
    await serverWithFeedToken();

    const response = await POST(
      feedRequest(
        { ...batch([killedEvent()]), padding: "x".repeat(70_000) },
        FEED_TOKEN,
      ),
    );

    expect(response.status).toBe(413);
  });

  it("rejects a batch of more than 200 events", async () => {
    const server = await serverWithFeedToken();
    const events = Array.from({ length: 201 }, (_, i) =>
      killedEvent({ eventId: `e-${i}` }),
    );

    const response = await POST(feedRequest(batch(events), FEED_TOKEN));

    expect(response.status).toBe(413);
    expect(await getRecentKills(db, server.id, { limit: 20 })).toEqual([]);
  });

  describe("how a killed event is understood", () => {
    const CTX = "Meta.Progression.Context.Player.KillContext.";
    const FLAG = "Meta.PlayerKillFlag.Player.";

    async function ingestOne(event: unknown) {
      const server = await serverWithFeedToken();
      await POST(feedRequest(batch([event]), FEED_TOKEN));
      const [kill] = await getRecentKills(db, server.id, { limit: 20 });
      return kill;
    }

    it("marks a headshot and keeps it out of the other tags", async () => {
      const kill = await ingestOne(
        killedEvent({
          contextTags: [
            `${CTX}Headshot`,
            `${FLAG}Local.Kill`,
            `${FLAG}Local.Death`,
          ],
        }),
      );

      expect(kill).toMatchObject({ headshot: true, suicide: false, tags: [] });
    });

    it("keeps the other context tags in short form and drops the constant flags", async () => {
      const kill = await ingestOne(
        killedEvent({
          contextTags: [
            `${CTX}Penetration`,
            `${CTX}Ricochet`,
            `${FLAG}Local.Kill`,
            `${FLAG}Local.Death`,
          ],
        }),
      );

      expect(kill).toMatchObject({
        headshot: false,
        tags: ["Penetration", "Ricochet"],
      });
    });

    it("marks a suicide from the Suicide tag", async () => {
      const kill = await ingestOne(
        killedEvent({ contextTags: [`${FLAG}Suicide`] }),
      );

      expect(kill).toMatchObject({ suicide: true, tags: [] });
    });

    it("marks a suicide when the killer is the victim", async () => {
      const kill = await ingestOne(
        killedEvent({
          killerSteamId: "76561198000000002",
          killerName: "Bob",
          contextTags: [],
        }),
      );

      expect(kill).toMatchObject({ suicide: true });
    });

    it("stores a death by the environment with no killer, cause or distance", async () => {
      const kill = await ingestOne({
        eventId: "e-fall",
        type: "killed",
        eventTime: 12.5,
        matchId: "m",
        mapName: "Kavkazi",
        victimName: "Bob",
        victimId: "v1",
        victimSteamId: "76561198000000002",
        contextTags: [`${CTX}Falling`],
      });

      expect(kill).toMatchObject({
        killerSteamId: null,
        killerName: null,
        cause: null,
        distanceM: null,
        suicide: false,
        tags: ["Falling"],
      });
    });
  });

  describe("what the Server was doing when the kill arrived", () => {
    it("attaches the open Match and the Factions the players were on", async () => {
      const server = await serverWithFeedToken();
      const [match] = await db
        .insert(matches)
        .values({
          serverId: server.id,
          map: "Kavkazi",
          experiences: [],
          startedAt: new Date(),
        })
        .returning();
      await db.insert(latestSnapshots).values({
        serverId: server.id,
        capturedAt: new Date(),
        payload: snapshotFixture({
          players: [
            {
              steamId: "76561198000000001",
              displayName: "Alice",
              faction: "Lonestar",
              kills: 0,
              deaths: 0,
              cash: 0,
              ping: 1,
            },
            {
              steamId: "76561198000000002",
              displayName: "Bob",
              faction: "Valkyra",
              kills: 0,
              deaths: 0,
              cash: 0,
              ping: 1,
            },
          ],
        }),
      });

      await POST(feedRequest(batch([killedEvent()]), FEED_TOKEN));

      const [kill] = await getRecentKills(db, server.id, { limit: 20 });
      expect(kill).toMatchObject({
        matchId: match.id,
        killerFaction: "Lonestar",
        victimFaction: "Valkyra",
      });
    });

    it("attaches nothing when no Match is open and the players are not in the Snapshot", async () => {
      const server = await serverWithFeedToken();

      await POST(feedRequest(batch([killedEvent()]), FEED_TOKEN));

      const [kill] = await getRecentKills(db, server.id, { limit: 20 });
      expect(kill).toMatchObject({
        matchId: null,
        killerFaction: null,
        victimFaction: null,
      });
    });

    it("ignores a Match that has already closed", async () => {
      const server = await serverWithFeedToken();
      await db.insert(matches).values({
        serverId: server.id,
        map: "Kavkazi",
        experiences: [],
        startedAt: new Date(Date.now() - 60_000),
        endedAt: new Date(),
      });

      await POST(feedRequest(batch([killedEvent()]), FEED_TOKEN));

      const [kill] = await getRecentKills(db, server.id, { limit: 20 });
      expect(kill.matchId).toBeNull();
    });
  });
});
