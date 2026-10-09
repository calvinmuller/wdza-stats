import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  latestSnapshots,
  listenTo,
  SERVERS_CHANGED_CHANNEL,
  servers,
  staffAuditLog,
  staffMembers,
  type StaffRole,
} from "@wdza-stats/db";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createStaffMember } from "@/lib/staff";

let requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/admin/servers",
  useRouter: () => ({}),
}));

const actions = await import("./actions");
const { default: ServersPage } = await import("./page");

const PASSWORD = "correct horse battery";
const NOT_FOUND = /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/;

beforeEach(async () => {
  requestHeaders = new Headers();
  await db.delete(staffAuditLog);
  await db.delete(staffMembers);
  await db.delete(latestSnapshots);
  await db.delete(servers);
});

afterAll(async () => {
  await db.delete(staffAuditLog);
  await db.delete(staffMembers);
  await db.delete(servers);
  await db.$client.end();
});

async function signInAs(role: StaffRole) {
  const email = `${role}@example.test`;
  await createStaffMember({ email, name: role, password: PASSWORD, role });
  const { headers } = await auth.api.signInEmail({ body: { email, password: PASSWORD }, returnHeaders: true });
  requestHeaders = new Headers({ cookie: headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") });
}

function form(fields: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const SECOND = {
  name: "WDZA #2",
  slug: "wdza-2",
  baseUrl: "http://203.0.113.20:9006/",
  rconToken: "second-secret-token",
  enabled: "on",
};

const serverRows = () => db.select().from(servers);

describe("server actions", () => {
  const calls: Array<[string, () => Promise<unknown>]> = [
    ["addServerAction", () => actions.addServerAction(null, form(SECOND))],
    ["updateServerAction", () => actions.updateServerAction(999_999, null, form(SECOND))],
    ["generateFeedTokenAction", () => actions.generateFeedTokenAction(999_999, { token: null, error: null }, form())],
  ];

  it.each(calls)("%s refuses an anonymous caller and a moderator", async (_name, call) => {
    await expect(call()).rejects.toThrow("Forbidden");
    await signInAs("moderator");
    await expect(call()).rejects.toThrow("Forbidden");
    expect(await serverRows()).toEqual([]);
  });

  it("lets an admin add a Server, telling the Worker about it", async () => {
    await signInAs("admin");
    const notified: string[] = [];
    const listener = listenTo(process.env.DATABASE_URL!, SERVERS_CHANGED_CHANNEL, (payload) => notified.push(payload));
    await listener.ready;

    expect(await actions.addServerAction(null, form(SECOND))).toEqual({ ok: true });

    const [row] = await serverRows();
    expect(row).toMatchObject({
      name: "WDZA #2",
      slug: "wdza-2",
      baseUrl: "http://203.0.113.20:9006",
      rconToken: "second-secret-token",
      enabled: true,
    });
    await vi.waitFor(() => expect(notified).toEqual([String(row.id)]));
    await listener.stop();
  });

  it("never records the RCON token in the audit log", async () => {
    await signInAs("admin");

    await actions.addServerAction(null, form(SECOND));
    const [row] = await serverRows();
    await actions.updateServerAction(row.id, null, form({ ...SECOND, rconToken: "rotated-secret-token" }));

    const audit = JSON.stringify(await db.select().from(staffAuditLog));
    expect(audit).toContain("add_server");
    expect(audit).toContain("update_server");
    expect(audit).not.toContain("second-secret-token");
    expect(audit).not.toContain("rotated-secret-token");
  });

  it("keeps the RCON token when an edit leaves it blank, and replaces it when one is given", async () => {
    await signInAs("admin");
    await actions.addServerAction(null, form(SECOND));
    const [row] = await serverRows();

    expect(await actions.updateServerAction(row.id, null, form({ ...SECOND, name: "Renamed", rconToken: "" }))).toEqual({ ok: true });
    expect((await serverRows())[0]).toMatchObject({ name: "Renamed", rconToken: "second-secret-token" });

    await actions.updateServerAction(row.id, null, form({ ...SECOND, rconToken: "rotated-secret-token" }));
    expect((await serverRows())[0].rconToken).toBe("rotated-secret-token");
  });

  it("disables a Server when the Enabled box is unticked", async () => {
    await signInAs("admin");
    await actions.addServerAction(null, form(SECOND));
    const [row] = await serverRows();

    const { enabled: _enabled, ...unticked } = SECOND;
    await actions.updateServerAction(row.id, null, form({ ...unticked, rconToken: "" }));

    expect((await serverRows())[0].enabled).toBe(false);
  });

  it.each([
    [{ name: " " }, "Enter a name."],
    [{ slug: "Not A Slug" }, "lowercase letters"],
    [{ baseUrl: "ftp://203.0.113.20" }, "RCON URL"],
    [{ rconToken: "" }, "RCON token"],
  ])("refuses to add a Server with %o", async (override, error) => {
    await signInAs("admin");

    const result = await actions.addServerAction(null, form({ ...SECOND, ...override }));

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining(error) });
    expect(await serverRows()).toEqual([]);
  });

  it("refuses a URL name or RCON URL another Server already has", async () => {
    await signInAs("admin");
    await actions.addServerAction(null, form(SECOND));

    expect(await actions.addServerAction(null, form({ ...SECOND, baseUrl: "http://203.0.113.30:9006" }))).toMatchObject({
      ok: false,
      error: expect.stringContaining("URL name"),
    });
    expect(await actions.addServerAction(null, form({ ...SECOND, slug: "other" }))).toMatchObject({
      ok: false,
      error: expect.stringContaining("RCON URL"),
    });
    expect(await serverRows()).toHaveLength(1);
  });

  it("issues a kill feed token for the chosen Server only", async () => {
    await signInAs("admin");
    const [first, second] = await db
      .insert(servers)
      .values([
        { name: "One", slug: "one", baseUrl: "http://one.test:9006" },
        { name: "Two", slug: "two", baseUrl: "http://two.test:9006" },
      ])
      .returning();

    const state = await actions.generateFeedTokenAction(second.id, { token: null, error: null }, form());

    expect(state.token).toMatch(/^wkf_/);
    const [one] = await db.select().from(servers).where(eq(servers.id, first.id));
    const [two] = await db.select().from(servers).where(eq(servers.id, second.id));
    expect(one.feedTokenHash).toBeNull();
    expect(two.feedTokenHash).not.toBeNull();
  });
});

describe("ServersPage", () => {
  it("lists each Server without ever showing its RCON token", async () => {
    await signInAs("admin");
    await db.insert(servers).values({
      name: "WDZA #2",
      slug: "wdza-2",
      baseUrl: "http://203.0.113.20:9006",
      rconToken: "second-secret-token",
    });

    const html = renderToStaticMarkup(await ServersPage());

    expect(html).toContain("Add a Server");
    expect(html).toContain("WDZA #2");
    expect(html).toContain('href="/servers/wdza-2"');
    expect(html).toContain("Leave blank to keep the current one");
    expect(html).not.toContain("second-secret-token");
  });

  it("sends an anonymous visitor to sign in and 404s a moderator", async () => {
    await expect(ServersPage()).rejects.toThrow(/NEXT_REDIRECT/);
    await signInAs("moderator");
    await expect(ServersPage()).rejects.toThrow(NOT_FOUND);
  });
});
