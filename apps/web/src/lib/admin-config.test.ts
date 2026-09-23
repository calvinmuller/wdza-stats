import {
  achievementDefinitions,
  bannedPlayers,
  challengeDefinitions,
  createDb,
  kickVoteSettings,
  levelThresholds,
  notificationRules,
  notificationSettings,
  xpRewards,
  type Database,
} from "@wdza-stats/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  banPlayerFromForm,
  getKickVoteSettings,
  getNotificationSettings,
  listAchievementDefinitions,
  listBannedPlayers,
  listChallengeDefinitions,
  listLevelThresholds,
  listNotificationRules,
  listXpRewards,
  unbanPlayerFromForm,
  updateAchievementDefinitionFromForm,
  updateChallengeDefinitionFromForm,
  updateKickVoteSettingsFromForm,
  updateLevelThresholdFromForm,
  updateNotificationRuleFromForm,
  updateNotificationSettingsFromForm,
  updateXpRewardFromForm,
} from "./admin-config";

const db: Database = createDb(process.env.DATABASE_URL!);

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.append(key, value);
  }
  return data;
}

// Every config table these functions touch is shared, migration-seeded
// config (see schema.ts) - other suites rely on the seeded defaults staying
// in place, so every test here restores whatever row it edits.
afterAll(async () => {
  await db.$client.end();
});

describe("XP rewards", () => {
  it("updates the configured amount for a reason", async () => {
    const [original] = await db.select().from(xpRewards).where(eq(xpRewards.reason, "kill"));
    try {
      await updateXpRewardFromForm(db, "kill", formData({ amount: "777" }));

      const rows = await listXpRewards(db);
      expect(rows.find((row) => row.reason === "kill")?.amount).toBe(777);
    } finally {
      await db.update(xpRewards).set({ amount: original.amount }).where(eq(xpRewards.reason, "kill"));
    }
  });

  it("rejects a non-numeric amount without writing anything", async () => {
    const [original] = await db.select().from(xpRewards).where(eq(xpRewards.reason, "kill"));

    await expect(updateXpRewardFromForm(db, "kill", formData({ amount: "not-a-number" }))).rejects.toThrow();

    const [after] = await db.select().from(xpRewards).where(eq(xpRewards.reason, "kill"));
    expect(after.amount).toBe(original.amount);
  });

  it("rejects an unknown reason", async () => {
    await expect(
      updateXpRewardFromForm(db, "not_a_real_reason" as never, formData({ amount: "100" })),
    ).rejects.toThrow();
  });
});

describe("Level curve", () => {
  it("updates the configured xpRequired for a level", async () => {
    const [original] = await db.select().from(levelThresholds).where(eq(levelThresholds.level, 2));
    try {
      await updateLevelThresholdFromForm(db, 2, formData({ xpRequired: "1234" }));

      const rows = await listLevelThresholds(db);
      expect(rows.find((row) => row.level === 2)?.xpRequired).toBe(1234);
    } finally {
      await db.update(levelThresholds).set({ xpRequired: original.xpRequired }).where(eq(levelThresholds.level, 2));
    }
  });

  it("rejects a negative xpRequired without writing anything", async () => {
    const [original] = await db.select().from(levelThresholds).where(eq(levelThresholds.level, 2));

    await expect(updateLevelThresholdFromForm(db, 2, formData({ xpRequired: "-5" }))).rejects.toThrow();

    const [after] = await db.select().from(levelThresholds).where(eq(levelThresholds.level, 2));
    expect(after.xpRequired).toBe(original.xpRequired);
  });
});

describe("Challenge definitions", () => {
  it("updates the configured target and xpReward for a definition", async () => {
    // Inserted fresh rather than mutating a migration-seeded row: unlike the
    // other config tables (all keyed by a fixed enum-like value), several
    // other test files reset challengeDefinitions wholesale between tests
    // (it has no natural per-row ownership), so a seeded row here can't be
    // relied on to still exist when this test runs.
    const [definition] = await db
      .insert(challengeDefinitions)
      .values({ type: "kills", scope: "daily", target: 15, xpReward: 300 })
      .returning();
    try {
      await updateChallengeDefinitionFromForm(db, definition.id, formData({ target: "2", xpReward: "999" }));

      const rows = await listChallengeDefinitions(db);
      const updated = rows.find((row) => row.id === definition.id);
      expect(updated).toMatchObject({ target: 2, xpReward: 999 });
    } finally {
      await db.delete(challengeDefinitions).where(eq(challengeDefinitions.id, definition.id));
    }
  });
});

describe("Achievement definitions", () => {
  it("updates the configured name, description, and threshold for an achievement", async () => {
    const [original] = await db
      .select()
      .from(achievementDefinitions)
      .where(eq(achievementDefinitions.id, "first_blood"));
    try {
      await updateAchievementDefinitionFromForm(
        db,
        "first_blood",
        formData({ name: "First Kill", description: "Get your very first kill", threshold: "2" }),
      );

      const rows = await listAchievementDefinitions(db);
      const updated = rows.find((row) => row.id === "first_blood");
      expect(updated).toMatchObject({
        name: "First Kill",
        description: "Get your very first kill",
        threshold: 2,
      });
    } finally {
      await db
        .update(achievementDefinitions)
        .set({ name: original.name, description: original.description, threshold: original.threshold })
        .where(eq(achievementDefinitions.id, "first_blood"));
    }
  });
});

describe("Notification rules", () => {
  it("updates the configured priority and template for a kind", async () => {
    const [original] = await db.select().from(notificationRules).where(eq(notificationRules.kind, "KillStreak3"));
    try {
      await updateNotificationRuleFromForm(
        db,
        "KillStreak3",
        formData({ priority: "high", template: "{{steamId}} is unstoppable!" }),
      );

      const rows = await listNotificationRules(db);
      const updated = rows.find((row) => row.kind === "KillStreak3");
      expect(updated).toMatchObject({ priority: "high", template: "{{steamId}} is unstoppable!" });
    } finally {
      await db
        .update(notificationRules)
        .set({ priority: original.priority, template: original.template })
        .where(eq(notificationRules.kind, "KillStreak3"));
    }
  });

  it("rejects an invalid priority without writing anything", async () => {
    const [original] = await db.select().from(notificationRules).where(eq(notificationRules.kind, "KillStreak3"));

    await expect(
      updateNotificationRuleFromForm(db, "KillStreak3", formData({ priority: "urgent", template: "x" })),
    ).rejects.toThrow();

    const [after] = await db.select().from(notificationRules).where(eq(notificationRules.kind, "KillStreak3"));
    expect(after.priority).toBe(original.priority);
  });
});

describe("Notification settings", () => {
  it("updates the configured max low/normal notifications per minute", async () => {
    const original = await getNotificationSettings(db);
    try {
      await updateNotificationSettingsFromForm(db, formData({ maxLowNormalPerMinute: "5" }));

      const updated = await getNotificationSettings(db);
      expect(updated.maxLowNormalPerMinute).toBe(5);
    } finally {
      await db
        .update(notificationSettings)
        .set({ maxLowNormalPerMinute: original.maxLowNormalPerMinute })
        .where(eq(notificationSettings.id, 1));
    }
  });
});

describe("KickVote settings", () => {
  afterEach(async () => {
    // Restore the migration-seeded defaults other tests rely on.
    await db
      .update(kickVoteSettings)
      .set({ thresholdBallots: 25, durationSeconds: 300, initiatorCooldownSeconds: 600 })
      .where(eq(kickVoteSettings.id, 1));
  });

  it("updates the threshold, duration and cooldown, returning the values before and after", async () => {
    const change = await updateKickVoteSettingsFromForm(
      db,
      formData({ thresholdBallots: "10", durationSeconds: "120", initiatorCooldownSeconds: "0" }),
    );

    const expected = { thresholdBallots: 10, durationSeconds: 120, initiatorCooldownSeconds: 0 };
    expect(change).toEqual({
      old: { thresholdBallots: 25, durationSeconds: 300, initiatorCooldownSeconds: 600 },
      new: expected,
    });
    expect(await getKickVoteSettings(db)).toEqual(expected);
  });

  it.each([
    ["a threshold below 1", { thresholdBallots: "0", durationSeconds: "300", initiatorCooldownSeconds: "600" }],
    ["a negative duration", { thresholdBallots: "25", durationSeconds: "-1", initiatorCooldownSeconds: "600" }],
    ["a negative cooldown", { thresholdBallots: "25", durationSeconds: "300", initiatorCooldownSeconds: "-5" }],
    ["a non-number", { thresholdBallots: "lots", durationSeconds: "300", initiatorCooldownSeconds: "600" }],
  ])("rejects %s without writing anything", async (_label, fields) => {
    await expect(updateKickVoteSettingsFromForm(db, formData(fields))).rejects.toThrow();

    expect(await getKickVoteSettings(db)).toEqual({
      thresholdBallots: 25,
      durationSeconds: 300,
      initiatorCooldownSeconds: 600,
    });
  });
});

describe("Banned players", () => {
  afterEach(async () => {
    await db.delete(bannedPlayers);
  });

  it("bans a steamId with an optional reason and lists it", async () => {
    await banPlayerFromForm(db, formData({ steamId: "1", reason: "cheating" }));

    const rows = await listBannedPlayers(db);
    expect(rows).toEqual([
      { steamId: "1", reason: "cheating", bannedAt: rows[0].bannedAt },
    ]);
  });

  it("bans a steamId with no reason given", async () => {
    await banPlayerFromForm(db, formData({ steamId: "1" }));

    const [row] = await listBannedPlayers(db);
    expect(row.reason).toBeNull();
  });

  it("re-banning an already-banned steamId updates its reason instead of erroring", async () => {
    await banPlayerFromForm(db, formData({ steamId: "1", reason: "cheating" }));
    await banPlayerFromForm(db, formData({ steamId: "1", reason: "griefing" }));

    const rows = await listBannedPlayers(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe("griefing");
  });

  it("unbans a steamId", async () => {
    await banPlayerFromForm(db, formData({ steamId: "1" }));

    await unbanPlayerFromForm(db, "1");

    expect(await listBannedPlayers(db)).toEqual([]);
  });
});
