import { createDb, type Database } from "@wdza-stats/db";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it } from "vitest";
import { ADMIN_PATH_SECRET } from "@/lib/admin-secret";
import AdminPage from "./page";

const db: Database = createDb(process.env.DATABASE_URL!);

afterAll(async () => {
  await db.$client.end();
});

async function renderPage(adminSecret: string) {
  const element = await AdminPage({ params: Promise.resolve({ adminSecret }) });
  return renderToStaticMarkup(element);
}

describe("AdminPage", () => {
  it("404s (via notFound) for any path that doesn't match the configured secret", async () => {
    await expect(renderPage("some-guessed-path")).rejects.toThrow();
  });

  it("renders the config editor when the path matches the configured secret", async () => {
    const html = await renderPage(ADMIN_PATH_SECRET);

    expect(html).toContain("XP rewards");
    expect(html).toContain("Level curve");
    expect(html).toContain("Daily challenges");
    expect(html).toContain("Achievements");
    expect(html).toContain("Notification rules");
    expect(html).toContain("Notification settings");
    // Seeded config rows should show up as editable fields.
    expect(html).toContain("kill");
    expect(html).toContain("Level 2");
  });

  it("never renders a password, Authorization header, or the Steam API key", async () => {
    // apps/web/src/no-rcon-access.test.ts already enforces that no apps/web
    // source file even references the RCON token env var by name, so this
    // page structurally can't leak it - this covers the other credentials
    // apps/web does have access to.
    const html = await renderPage(ADMIN_PATH_SECRET);

    expect(html.toLowerCase()).not.toContain("authorization");
    expect(html.toLowerCase()).not.toContain("steam_api_key");
    expect(html).not.toContain(process.env.STEAM_API_KEY!);
  });
});
