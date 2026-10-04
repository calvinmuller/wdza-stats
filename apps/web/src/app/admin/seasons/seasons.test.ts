import { renderToStaticMarkup } from "react-dom/server";
import { desc, gt } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { currentSeason, seasons, staffAuditLog, staffMembers, type StaffRole } from "@wdza-stats/db";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createStaffMember } from "@/lib/staff";

let requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({}),
}));

const { startSeasonAction } = await import("./actions");
const { default: SeasonsPage } = await import("./page");

const PASSWORD = "correct horse battery";
const SIGN_IN_REDIRECT = /NEXT_REDIRECT/;
const NOT_FOUND = /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/;

// Season 1 comes from the migration; each test cleans up above it.
let baseline: number;

beforeEach(async () => {
  requestHeaders = new Headers();
  await db.delete(staffMembers);
  await db.delete(staffAuditLog);
  baseline ??= (await currentSeason(db)).number;
  await db.delete(seasons).where(gt(seasons.number, baseline));
});

afterAll(async () => {
  await db.delete(staffMembers);
  await db.delete(staffAuditLog);
  await db.delete(seasons).where(gt(seasons.number, baseline));
  await db.$client.end();
});

async function signInAs(role: StaffRole, mustChangePassword = false) {
  const email = `${role}@example.test`;
  const created = await createStaffMember({ email, name: role, password: PASSWORD, role, mustChangePassword });
  const { headers } = await auth.api.signInEmail({ body: { email, password: PASSWORD }, returnHeaders: true });
  requestHeaders = new Headers({ cookie: headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") });
  return created;
}

function form(fields: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const startNext = () => startSeasonAction(null, form({ number: String(baseline + 1), name: "Dust Storm" }));

describe("startSeasonAction", () => {
  it("refuses an anonymous caller and a moderator, and creates nothing", async () => {
    await expect(startNext()).rejects.toThrow("Forbidden");
    await signInAs("moderator");
    await expect(startNext()).rejects.toThrow("Forbidden");

    expect((await currentSeason(db)).number).toBe(baseline);
    expect(await db.select().from(staffAuditLog)).toHaveLength(0);
  });

  it("refuses an admin who still has to change their password", async () => {
    await signInAs("admin", true);

    await expect(startNext()).rejects.toThrow("Password change required");
    expect((await currentSeason(db)).number).toBe(baseline);
  });

  it("lets an admin start the next Season, recorded in the audit log", async () => {
    const admin = await signInAs("admin");

    expect(await startNext()).toEqual({ ok: true });

    const season = await currentSeason(db);
    expect(season).toMatchObject({ number: baseline + 1, name: "Dust Storm" });
    const [entry] = await db.select().from(staffAuditLog).orderBy(desc(staffAuditLog.id));
    expect(entry).toMatchObject({
      staffMemberId: admin.id,
      actorEmail: "admin@example.test",
      action: "start_season",
      target: String(season.number),
      detail: { name: "Dust Storm" },
    });
  });

  it("refuses a second start of the same Season, so a stale page can't skip one", async () => {
    await signInAs("admin");
    await startNext();

    expect(await startNext()).toMatchObject({ ok: false });
    expect((await currentSeason(db)).number).toBe(baseline + 1);
    expect(await db.select().from(staffAuditLog)).toHaveLength(1);
  });
});

describe("SeasonsPage", () => {
  it("shows the current Season, offers the next, and lists every Season with its start", async () => {
    await signInAs("admin");
    await startSeasonAction(null, form({ number: String(baseline + 1), name: "Dust Storm" }));

    const html = renderToStaticMarkup(await SeasonsPage());

    expect(html).toContain(`Season ${baseline + 1}`);
    expect(html).toContain("Dust Storm");
    expect(html).toContain(`Start Season ${baseline + 2}`);
    expect(html).toContain("Season 1");
    expect(html).toMatch(/\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}:\d{2} UTC/);
  });

  it("sends an anonymous visitor to sign in and 404s a moderator", async () => {
    await expect(SeasonsPage()).rejects.toThrow(SIGN_IN_REDIRECT);
    await signInAs("moderator");
    await expect(SeasonsPage()).rejects.toThrow(NOT_FOUND);
  });
});
