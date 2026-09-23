import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { kickVotes, servers, staffMembers, steamProfiles, type StaffRole } from "@wdza-stats/db";
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

const { default: KickVotesPage } = await import("./page");

const PASSWORD = "correct horse battery";

beforeEach(async () => {
  requestHeaders = new Headers();
  await db.delete(kickVotes);
  await db.delete(servers);
  await db.delete(steamProfiles);
  await db.delete(staffMembers);
});

afterAll(async () => {
  // kick_votes references servers: leaving rows behind would stop later files
  // from clearing servers.
  await db.delete(kickVotes);
  await db.delete(servers);
  await db.delete(steamProfiles);
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

async function renderPage(searchParams: { alreadyEnded?: string } = {}) {
  return renderToStaticMarkup(await KickVotesPage({ searchParams: Promise.resolve(searchParams) }));
}

describe("KickVotesPage", () => {
  it("redirects an anonymous visitor to sign in", async () => {
    await expect(renderPage()).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("shows a moderator the settings without letting them save", async () => {
    await signInAs("moderator");

    const html = await renderPage();

    expect(html).toContain("Active kick votes");
    expect(html).toContain('name="thresholdBallots"');
    expect(html).toContain("disabled");
    expect(html).not.toContain("Save");
  });

  it("says when a cancel arrived after the kick vote had already ended", async () => {
    await signInAs("moderator");

    const html = await renderPage({ alreadyEnded: "42" });

    expect(html).toContain("Kick vote #42 had already ended");
  });

  it("lets an admin edit the settings", async () => {
    await signInAs("admin");

    const html = await renderPage();

    expect(html).toContain('name="thresholdBallots"');
    expect(html).not.toContain("disabled");
    expect(html).toContain("Save");
  });

  it("shows who started each active kick vote, and marks ones started before Steam sign-in", async () => {
    await signInAs("moderator");
    const vote = async (label: string, initiator: { initiatorSteamId?: string; initiatorSessionId?: string }) => {
      const [server] = await db
        .insert(servers)
        .values({ name: label, baseUrl: `http://rcon-${crypto.randomUUID()}.test:9006` })
        .returning();
      await db.insert(kickVotes).values({
        serverId: server.id,
        targetSteamId: "1",
        targetName: "Cheatermc",
        reason: "wallhacks",
        threshold: 25,
        durationSeconds: 300,
        endsAt: new Date(Date.now() + 300_000),
        ...initiator,
      });
    };
    await db.insert(steamProfiles).values({ steamId: "76561198000000100", personaName: "Alice", achievements: [], status: "ok", fetchedAt: new Date() });
    await vote("Server A", { initiatorSteamId: "76561198000000100" });
    await vote("Server B", { initiatorSessionId: "old-anonymous-session" });

    const html = await renderPage();

    expect(html).toContain('href="/players/76561198000000100"');
    expect(html).toContain(">Alice<");
    expect(html).toContain("anonymous (before Steam sign-in)");
  });
});
