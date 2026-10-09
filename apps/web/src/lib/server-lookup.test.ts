import { createDb, matches, servers, type Database } from "@wdza-stats/db";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import HomePage from "@/app/page";
import LegacyMatchPage from "@/app/matches/[id]/page";
import LegacyStatsPage from "@/app/stats/page";
import { getPublicServerBySlug, redirectToDefaultServer, resolveApiServer } from "./server-lookup";
import { parseServerPath, serverPath } from "./server-path";

const db: Database = createDb(process.env.DATABASE_URL!);

afterEach(async () => {
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

describe("HomePage", () => {
  it("lists every enabled Server", async () => {
    await seedServers();

    const html = renderToStaticMarkup(await HomePage());

    expect(html).toContain('href="/servers/first"');
    expect(html).toContain('href="/servers/second"');
    expect(html).not.toContain("Retired");
  });

  it("goes straight to the only Server when there is just one", async () => {
    await db.insert(servers).values({ name: "Only", slug: "only", baseUrl: "http://only.test:9006" });

    expect(await redirectedTo(() => HomePage())).toBe("/servers/only");
  });
});
