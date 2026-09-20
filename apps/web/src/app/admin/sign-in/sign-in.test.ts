import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { staffMembers } from "@wdza-stats/db";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createStaffMember } from "@/lib/staff";

let requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));
// The client form calls useRouter, which needs a mounted app router; static
// rendering has none. redirect() and notFound() stay real.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({}),
}));

const { default: SignInPage } = await import("./page");

const PASSWORD = "correct horse battery";
const ORIGIN = "http://localhost:3000";

beforeEach(async () => {
  requestHeaders = new Headers();
  await db.delete(staffMembers);
});

afterAll(async () => {
  await db.delete(staffMembers);
  await db.$client.end();
});

// Goes through the HTTP handler, as the browser does, because Better Auth only
// rate limits requests that arrive that way. Each test uses its own client IP
// so their attempt counters (in memory) don't collide.
function post(path: string, body: unknown, ip: string, cookie?: string) {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        "x-forwarded-for": ip,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

const signIn = (email: string, password: string, ip: string) => post("sign-in/email", { email, password }, ip);

describe("signing in over HTTP", () => {
  it("succeeds with the right password and sets a session cookie", async () => {
    await createStaffMember({ email: "a@example.test", name: "A", password: PASSWORD, role: "admin" });

    const res = await signIn("a@example.test", PASSWORD, "10.0.0.1");

    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().join("\n")).toMatch(/HttpOnly/i);
  });

  it("answers an unknown email exactly like a wrong password", async () => {
    await createStaffMember({ email: "a@example.test", name: "A", password: PASSWORD, role: "admin" });

    const wrongPassword = await signIn("a@example.test", "not the password", "10.0.0.2");
    const unknownEmail = await signIn("nobody@example.test", PASSWORD, "10.0.0.2");

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(await unknownEmail.text()).toBe(await wrongPassword.text());
  });

  it("rate limits repeated attempts from one address", async () => {
    await createStaffMember({ email: "a@example.test", name: "A", password: PASSWORD, role: "admin" });

    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      statuses.push((await signIn("a@example.test", "not the password", "10.0.0.3")).status);
    }

    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses.slice(5)).toEqual([429, 429]);
    // Even the right password is refused while limited.
    expect((await signIn("a@example.test", PASSWORD, "10.0.0.3")).status).toBe(429);
    // Another address is unaffected.
    expect((await signIn("a@example.test", PASSWORD, "10.0.0.4")).status).toBe(200);
  });
});

describe("signing out", () => {
  it("ends the session", async () => {
    await createStaffMember({ email: "a@example.test", name: "A", password: PASSWORD, role: "admin" });
    const cookie = (await signIn("a@example.test", PASSWORD, "10.0.0.5")).headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).not.toBeNull();

    const res = await post("sign-out", {}, "10.0.0.5", cookie);

    expect(res.status).toBe(200);
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
  });
});

describe("SignInPage", () => {
  it("renders the form for an anonymous visitor", async () => {
    const html = renderToStaticMarkup(await SignInPage());

    expect(html).toContain("Staff sign in");
    expect(html).toContain('type="password"');
  });

  it("sends an already signed-in Staff Member on to /admin", async () => {
    await createStaffMember({ email: "a@example.test", name: "A", password: PASSWORD, role: "admin" });
    const cookie = (await signIn("a@example.test", PASSWORD, "10.0.0.6")).headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    requestHeaders = new Headers({ cookie });

    await expect(SignInPage()).rejects.toThrow(/NEXT_REDIRECT/);
  });
});
