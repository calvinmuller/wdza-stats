import { gt } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Database } from "./client";
import { seasons } from "./schema";
import { currentSeason, listSeasons, startNextSeason } from "./season";

const db: Database = createDb(process.env.DATABASE_URL!);

// Season 1 comes from the migration and can't be removed while Matches point
// at it, so each test starts from whatever is current and cleans up above it.
let baseline: number;

beforeEach(async () => {
  baseline = (await currentSeason(db)).number;
});

afterEach(async () => {
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
