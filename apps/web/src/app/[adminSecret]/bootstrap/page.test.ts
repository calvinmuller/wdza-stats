import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, staffMembers, type Database } from "@wdza-stats/db";
import { ADMIN_PATH_SECRET } from "@/lib/admin-secret";
import { createStaffMember } from "@/lib/staff";
import { createFirstAdminAction, resetAdminPasswordAction } from "./actions";
import BootstrapPage from "./page";

const db: Database = createDb(process.env.DATABASE_URL!);

beforeEach(async () => {
  await db.delete(staffMembers);
});

afterAll(async () => {
  await db.delete(staffMembers);
  await db.$client.end();
});

async function renderPage(adminSecret: string) {
  return renderToStaticMarkup(await BootstrapPage({ params: Promise.resolve({ adminSecret }) }));
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("BootstrapPage", () => {
  it("404s for any path that isn't the secret", async () => {
    await expect(renderPage("some-guessed-path")).rejects.toThrow();
  });

  it("offers to create the first admin while none exists", async () => {
    const html = await renderPage(ADMIN_PATH_SECRET);

    expect(html).toContain("Create the first admin");
    expect(html).not.toContain("Reset an admin");
  });

  it("offers a password reset, not creation, once an admin exists", async () => {
    await createStaffMember({ email: "a@example.test", name: "A", password: "correct horse", role: "admin" });

    const html = await renderPage(ADMIN_PATH_SECRET);

    expect(html).toContain("Reset an admin");
    expect(html).not.toContain("Create the first admin");
  });
});

describe("bootstrap actions", () => {
  it("404 when called with the wrong secret, and change nothing", async () => {
    await expect(
      createFirstAdminAction("wrong", null, form({ email: "a@example.test", name: "A", password: "correct horse" })),
    ).rejects.toThrow();
    await expect(resetAdminPasswordAction("wrong", null, form({ email: "a@example.test", password: "correct horse" }))).rejects.toThrow();
    expect(await db.select().from(staffMembers)).toHaveLength(0);
  });

  it("create the first admin with the right secret, then refuse a second", async () => {
    const created = await createFirstAdminAction(
      ADMIN_PATH_SECRET,
      null,
      form({ email: "a@example.test", name: "A", password: "correct horse" }),
    );
    const second = await createFirstAdminAction(
      ADMIN_PATH_SECRET,
      null,
      form({ email: "b@example.test", name: "B", password: "correct horse" }),
    );

    expect(created).toEqual({ ok: true });
    expect(second).toMatchObject({ ok: false });
    expect(await db.select().from(staffMembers)).toHaveLength(1);
  });
});
