import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { staffMembers, type StaffRole } from "@wdza-stats/db";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createStaffMember } from "@/lib/staff";

let requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));

const actions = await import("./actions");

const PASSWORD = "correct horse battery";

beforeEach(async () => {
  requestHeaders = new Headers();
  await db.delete(staffMembers);
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

const form = () => new FormData();

// Each action is its own POST endpoint, so each one must refuse on its own,
// whatever the page did or didn't render. Refusal has to happen before any
// database write, which is why these can pass empty forms.
// `adminRuns` is false only for generateFeedTokenAction: run as an admin it would
// replace a real Server's feed token if one exists in the shared test database.
const calls: Array<[string, () => Promise<unknown>, boolean]> = [
  ["updateXpRewardAction", () => actions.updateXpRewardAction("kill", form()), true],
  ["updateLevelThresholdAction", () => actions.updateLevelThresholdAction(2, form()), true],
  ["updateChallengeDefinitionAction", () => actions.updateChallengeDefinitionAction(1, form()), true],
  ["updateAchievementDefinitionAction", () => actions.updateAchievementDefinitionAction("first-blood", form()), true],
  ["updateNotificationRuleAction", () => actions.updateNotificationRuleAction("MatchStarted", form()), true],
  ["updateNotificationSettingsAction", () => actions.updateNotificationSettingsAction(form()), true],
  ["banPlayerAction", () => actions.banPlayerAction(form()), true],
  ["unbanPlayerAction", () => actions.unbanPlayerAction("76561198000000000"), true],
  ["generateFeedTokenAction", () => actions.generateFeedTokenAction({ token: null, error: null }, form()), false],
];

describe.each(calls)("%s", (_name, call, adminRuns) => {
  it("refuses an anonymous caller", async () => {
    await expect(call()).rejects.toThrow("Forbidden");
  });

  it("refuses a moderator (until ticket 06 opens ban and unban to them)", async () => {
    await signInAs("moderator");

    await expect(call()).rejects.toThrow("Forbidden");
  });

  it.runIf(adminRuns)("lets an admin past the Role check", async () => {
    await signInAs("admin");

    // Whatever the action then does with an empty form (validation error,
    // redirect), it must not be the Role refusal.
    const outcome = await call().then(
      () => null,
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
    expect(outcome).not.toBe("Forbidden");
  });
});
