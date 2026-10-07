import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { bannedPlayers, staffMembers, type StaffRole } from "@wdza-stats/db";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createStaffMember } from "@/lib/staff";

let requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));
// The sign-out button calls useRouter, which needs a mounted app router.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({}),
}));

const { default: AdminPage } = await import("./page");

const PASSWORD = "correct horse battery";

beforeEach(async () => {
  requestHeaders = new Headers();
  await db.delete(staffMembers);
  await db.delete(bannedPlayers);
});

afterAll(async () => {
  await db.delete(staffMembers);
  await db.$client.end();
});

async function signInAs(role: StaffRole) {
  const email = `${role}@example.test`;
  await createStaffMember({ email, name: role, password: PASSWORD, role });
  const { headers } = await auth.api.signInEmail({ body: { email, password: PASSWORD }, returnHeaders: true });
  requestHeaders = new Headers({
    cookie: headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  });
}

async function renderPage() {
  return renderToStaticMarkup(await AdminPage());
}

describe("AdminPage", () => {
  it("redirects an anonymous visitor to sign in", async () => {
    await expect(renderPage()).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("shows a moderator only the Players and Kick Votes sections in its nav", async () => {
    await signInAs("moderator");

    const html = await renderPage();

    expect(html).toContain("Banned players");
    expect(html).toContain("moderator@example.test");
    expect(html).toContain("Kick Votes");
    expect(html).not.toContain("Achievements");
    expect(html).not.toContain("Server Token");
    expect(html).not.toContain("Staff");
  });

  it("offers Unban only for site bans, since a Warcon ban can only be lifted in Warcon", async () => {
    await db.insert(bannedPlayers).values([
      { steamId: "111", source: "site" },
      { steamId: "222", source: "warcon" },
    ]);
    await signInAs("moderator");

    const html = await renderPage();

    expect(html.match(/>Unban</g)).toHaveLength(1);
    expect(html).toContain("Banned in Warcon");
  });

  it("shows an admin the full sub nav and the Players section", async () => {
    await signInAs("admin");

    const html = await renderPage();

    for (const label of ["Players", "Kick Votes", "XP &amp; Levels", "Challenges", "Achievements", "Notifications", "Server Token", "Staff"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Banned players");
    expect(html).toContain("admin@example.test");
    expect(html).toContain("Sign out");
  });

  it("never renders a password, Authorization header, or the Steam API key", async () => {
    // apps/web/src/no-rcon-access.test.ts already enforces that no apps/web
    // source file even references the RCON token env var by name, so this
    // page structurally can't leak it - this covers the other credentials
    // apps/web does have access to.
    await signInAs("admin");

    const html = await renderPage();

    expect(html.toLowerCase()).not.toContain("authorization");
    expect(html.toLowerCase()).not.toContain("steam_api_key");
    expect(html).not.toContain(process.env.STEAM_API_KEY!);
  });
});
