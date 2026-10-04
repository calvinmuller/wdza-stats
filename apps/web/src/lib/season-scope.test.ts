import { createDb, currentSeason, seasons, type Database } from "@wdza-stats/db";
import { gt } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { resolveSeasonScope } from "./season-scope";

const db: Database = createDb(process.env.DATABASE_URL!);

// Season 1 comes from the migration; each test cleans up above it.
let baseline: number;

beforeAll(async () => {
  baseline = (await currentSeason(db)).number;
});

afterEach(async () => {
  await db.delete(seasons).where(gt(seasons.number, baseline));
});

afterAll(async () => {
  await db.$client.end();
});

describe("resolveSeasonScope", () => {
  it("resolves an absent value to the given default", async () => {
    const [current] = await db.insert(seasons).values({ number: baseline + 1, name: "Dust Storm" }).returning();

    expect(await resolveSeasonScope(db, undefined, "career")).toEqual({ kind: "career" });
    expect(await resolveSeasonScope(db, null, "current")).toEqual({ kind: "season", season: current });
  });

  it("resolves current, career, and a past Season's number", async () => {
    const [past] = await db.insert(seasons).values({ number: baseline + 1 }).returning();
    const [current] = await db.insert(seasons).values({ number: baseline + 2 }).returning();

    expect(await resolveSeasonScope(db, "current", "career")).toEqual({ kind: "season", season: current });
    expect(await resolveSeasonScope(db, "career", "current")).toEqual({ kind: "career" });
    expect(await resolveSeasonScope(db, String(past.number), "career")).toEqual({
      kind: "season",
      season: past,
    });
    expect(await resolveSeasonScope(db, String(current.number), "career")).toEqual({
      kind: "season",
      season: current,
    });
  });

  it("rejects an unknown Season number or a nonsense value instead of falling back", async () => {
    expect(await resolveSeasonScope(db, String(baseline + 1), "current")).toBeNull();
    expect(await resolveSeasonScope(db, "0", "current")).toBeNull();
    expect(await resolveSeasonScope(db, "1.5", "current")).toBeNull();
    expect(await resolveSeasonScope(db, "latest", "current")).toBeNull();
    expect(await resolveSeasonScope(db, "", "current")).toBeNull();
  });
});
