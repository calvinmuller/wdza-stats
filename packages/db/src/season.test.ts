import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Database } from "./client";
import { matches, playerCareerStats, playerSeasonStats, seasons, servers } from "./schema";
import { currentSeason, listSeasons, startNextSeason, withdrawableSeason, withdrawSeason } from "./season";

const db: Database = createDb(process.env.DATABASE_URL!);

// Season 1 comes from the migration and can't be removed while Matches point
// at it, so each test starts from whatever is current and cleans up above it.
let baseline: number;

beforeEach(async () => {
  baseline = (await currentSeason(db)).number;
});

afterEach(async () => {
  await db.delete(playerSeasonStats);
  await db.delete(playerCareerStats);
  await db.delete(matches);
  await db.delete(servers);
  await db.delete(seasons).where(gt(seasons.number, baseline));
});

afterAll(async () => {
  await db.$client.end();
});

describe("startNextSeason", () => {
  it("starts the next-numbered Season now, with its name, and makes it current", async () => {
    const before = new Date();

    const result = await startNextSeason(db, { number: baseline + 1, name: "  Dust Storm  " });

    expect(result).toMatchObject({ ok: true, season: { number: baseline + 1, name: "Dust Storm" } });
    const current = await currentSeason(db);
    expect(current).toMatchObject({ number: baseline + 1, name: "Dust Storm" });
    expect(current.startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(current.startedAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("leaves the name empty when none is given", async () => {
    await startNextSeason(db, { number: baseline + 1, name: "   " });

    expect((await currentSeason(db)).name).toBeNull();
  });

  it("refuses any number but the current Season's + 1, and creates nothing", async () => {
    for (const number of [baseline, baseline + 2, 0]) {
      expect(await startNextSeason(db, { number, name: "" })).toMatchObject({ ok: false });
    }

    expect((await currentSeason(db)).number).toBe(baseline);
  });

  it("refuses a number that isn't one, without naming it", async () => {
    const result = await startNextSeason(db, { number: Number("abc"), name: "" });

    expect(result).toMatchObject({ ok: false });
    expect(result.ok || result.error).not.toContain("NaN");
    expect((await currentSeason(db)).number).toBe(baseline);
  });

  it("refuses an overlong name", async () => {
    expect(await startNextSeason(db, { number: baseline + 1, name: "x".repeat(61) })).toMatchObject({ ok: false });
    expect((await currentSeason(db)).number).toBe(baseline);
  });

  it("starts exactly one Season when two admins confirm the same one at once", async () => {
    // A race, so repeat it.
    for (let i = 0; i < 10; i++) {
      const next = (await currentSeason(db)).number + 1;

      const results = await Promise.all([
        startNextSeason(db, { number: next, name: "A" }),
        startNextSeason(db, { number: next, name: "B" }),
      ]);

      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.find((r) => !r.ok)).toMatchObject({ error: expect.stringContaining(`Season ${next}`) });
      expect((await currentSeason(db)).number).toBe(next);
    }
  });
});

describe("listSeasons", () => {
  it("lists every Season, newest first", async () => {
    await startNextSeason(db, { number: baseline + 1, name: "Next" });

    const listed = await listSeasons(db);

    expect(listed[0]).toMatchObject({ number: baseline + 1, name: "Next" });
    expect(listed.map((s) => s.number)).toEqual([...listed.map((s) => s.number)].sort((a, b) => b - a));
    expect(listed.at(-1)?.number).toBe(1);
  });
});

describe("withdrawSeason", () => {
  async function seedServer() {
    const [server] = await db
      .insert(servers)
      .values({ name: "WDZA Test", baseUrl: `http://season-${crypto.randomUUID()}.test:9006` })
      .returning();
    return server;
  }

  async function startNext() {
    const result = await startNextSeason(db, { number: (await currentSeason(db)).number + 1, name: "" });
    if (!result.ok) throw new Error(result.error);
    return result.season;
  }

  // Inserted directly, so it takes the current Season like the Worker's do.
  async function openMatch(serverId: number) {
    const [match] = await db
      .insert(matches)
      .values({ serverId, map: "Foundry", experiences: ["Frontline"], startedAt: new Date() })
      .returning();
    return match;
  }

  async function seasonStats(seasonId: number, serverId: number) {
    return db
      .select()
      .from(playerSeasonStats)
      .where(and(eq(playerSeasonStats.seasonId, seasonId), eq(playerSeasonStats.serverId, serverId)))
      .orderBy(playerSeasonStats.steamId);
  }

  it("makes the previous Season current again, moving its open Matches and folding its totals back", async () => {
    const server = await seedServer();
    const previous = await currentSeason(db);
    await db.insert(playerCareerStats).values([
      { serverId: server.id, steamId: "1", displayName: "Alice", xp: 150, highestKillStreak: 6 },
      { serverId: server.id, steamId: "2", displayName: "Bob", xp: 30, highestKillStreak: 2 },
    ]);
    await db.insert(playerSeasonStats).values({
      seasonId: previous.id,
      serverId: server.id,
      steamId: "1",
      xp: 100,
      highestKillStreak: 6,
      matchesPlayed: 2,
    });
    const started = await startNext();
    const match = await openMatch(server.id);
    expect(match.seasonId).toBe(started.id);
    // Accrued by the open Match since the new Season started.
    await db.insert(playerSeasonStats).values([
      { seasonId: started.id, serverId: server.id, steamId: "1", xp: 50, highestKillStreak: 4 },
      { seasonId: started.id, serverId: server.id, steamId: "2", xp: 30, highestKillStreak: 2 },
    ]);
    const careerBefore = await db.select().from(playerCareerStats).orderBy(playerCareerStats.steamId);

    const result = await withdrawSeason(db, { number: started.number });

    expect(result).toEqual({ ok: true, season: started });
    expect(await currentSeason(db)).toEqual(previous);
    expect(await listSeasons(db)).not.toContainEqual(started);
    const [moved] = await db.select().from(matches).where(eq(matches.id, match.id));
    expect(moved.seasonId).toBe(previous.id);
    expect(await seasonStats(previous.id, server.id)).toMatchObject([
      { steamId: "1", xp: 150, highestKillStreak: 6, matchesPlayed: 2 },
      { steamId: "2", xp: 30, highestKillStreak: 2, matchesPlayed: 0 },
    ]);
    expect(await seasonStats(started.id, server.id)).toEqual([]);
    expect(await db.select().from(playerCareerStats).orderBy(playerCareerStats.steamId)).toEqual(careerBefore);
  });

  it("refuses once a Match in the Season has closed, and changes nothing", async () => {
    const server = await seedServer();
    const started = await startNext();
    const match = await openMatch(server.id);
    await db.update(matches).set({ endedAt: new Date() }).where(eq(matches.id, match.id));

    expect(await withdrawableSeason(db)).toBeNull();
    const result = await withdrawSeason(db, { number: started.number });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("a Match in it has already closed") });
    expect(await currentSeason(db)).toEqual(started);
  });

  it("refuses Season 1, and any Season but the current one", async () => {
    const first = await startNext();
    await startNext();

    expect(await withdrawSeason(db, { number: 1 })).toMatchObject({ ok: false });
    expect(await withdrawSeason(db, { number: first.number })).toMatchObject({ ok: false });
    expect((await currentSeason(db)).number).toBe(baseline + 2);
    expect((await listSeasons(db)).at(-1)?.number).toBe(1);
  });

  it("offers the current Season for withdrawal only while none of its Matches has closed", async () => {
    const server = await seedServer();
    if (baseline === 1) expect(await withdrawableSeason(db)).toBeNull();

    const started = await startNext();
    expect(await withdrawableSeason(db)).toEqual(started);

    await openMatch(server.id);
    expect(await withdrawableSeason(db)).toEqual(started);
  });

  it("refuses when a Match in the Season closes while the withdrawal waits, never losing what it credited", async () => {
    const server = await seedServer();
    const started = await startNext();
    const match = await openMatch(server.id);

    // The Worker closing the Match on its own connection, holding its
    // transaction open until the withdrawal is waiting on it.
    const worker = createDb(process.env.DATABASE_URL!);
    let closed!: () => void;
    let release!: () => void;
    const closedSignal = new Promise<void>((resolve) => (closed = resolve));
    const released = new Promise<void>((resolve) => (release = resolve));
    const closing = worker.transaction(async (tx) => {
      await tx.update(matches).set({ endedAt: new Date() }).where(eq(matches.id, match.id));
      await tx
        .insert(playerSeasonStats)
        .values({ seasonId: started.id, serverId: server.id, steamId: "1", kills: 3, matchesPlayed: 1 });
      closed();
      await released;
    });

    try {
      await closedSignal;
      const withdrawing = withdrawSeason(db, { number: started.number });
      await new Promise((resolve) => setTimeout(resolve, 200));
      release();
      await closing;

      expect(await withdrawing).toMatchObject({ ok: false });
      expect(await currentSeason(db)).toEqual(started);
      expect(await seasonStats(started.id, server.id)).toMatchObject([{ steamId: "1", kills: 3, matchesPlayed: 1 }]);
    } finally {
      release();
      await worker.$client.end();
    }
  });

  it("credits a Match close that waited on the withdrawal to the previous Season, and fails a stale write safely", async () => {
    const server = await seedServer();
    const previous = await currentSeason(db);
    const started = await startNext();
    const match = await openMatch(server.id);

    // Holds the withdrawal part-way: it gets its seasons and matches locks,
    // then waits for player_season_stats.
    const gate = createDb(process.env.DATABASE_URL!);
    const worker = createDb(process.env.DATABASE_URL!);
    let gated!: () => void;
    let open!: () => void;
    const gateHeld = new Promise<void>((resolve) => (gated = resolve));
    const opened = new Promise<void>((resolve) => (open = resolve));
    const gating = gate.transaction(async (tx) => {
      await tx.execute(sql`LOCK TABLE ${playerSeasonStats} IN ROW SHARE MODE`);
      gated();
      await opened;
    });
    const wait = () => new Promise((resolve) => setTimeout(resolve, 200));

    try {
      await gateHeld;
      const withdrawing = withdrawSeason(db, { number: started.number });
      await wait();

      // The Worker closing the Match as closeMatch does, reading its Season
      // from the UPDATE itself...
      const closing = worker.transaction(async (tx) => {
        const [claimed] = await tx
          .update(matches)
          .set({ endedAt: new Date() })
          .where(and(eq(matches.id, match.id), isNull(matches.endedAt)))
          .returning({ seasonId: matches.seasonId });
        await tx
          .insert(playerSeasonStats)
          .values({ seasonId: claimed.seasonId, serverId: server.id, steamId: "1", kills: 3, matchesPlayed: 1 });
        return claimed.seasonId;
      });
      // ...and another poll's XP upsert still holding the withdrawn Season's id.
      const staleWrite = db
        .insert(playerSeasonStats)
        .values({ seasonId: started.id, serverId: server.id, steamId: "2", xp: 10 });
      await wait();
      open();

      expect(await withdrawing).toMatchObject({ ok: true });
      expect(await closing).toBe(previous.id);
      await expect(staleWrite).rejects.toThrow();
      expect(await currentSeason(db)).toEqual(previous);
      expect(await seasonStats(previous.id, server.id)).toMatchObject([{ steamId: "1", kills: 3, matchesPlayed: 1 }]);
    } finally {
      open();
      await gating;
      await gate.$client.end();
      await worker.$client.end();
    }
  });
});
