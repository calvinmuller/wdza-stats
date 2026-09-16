import {
  achievementDefinitions,
  bannedPlayers,
  challengeDefinitions,
  levelThresholds,
  notificationRules,
  notificationSettings,
  xpRewards,
  type AchievementTrigger,
  type ChallengeScope,
  type ChallengeType,
  type Database,
  type NotificationKind,
  type NotificationPriority,
  type XpReason,
} from "@wdza-stats/db";
import { desc, eq } from "drizzle-orm";

// The Admin area's data access layer (ticket 15) - every read/write the
// admin UI (app/[adminSecret]) performs against the XP_REWARDS,
// LEVEL_THRESHOLDS, CHALLENGE_DEFINITIONS, ACHIEVEMENT_DEFINITIONS,
// NOTIFICATION_RULES, and NOTIFICATION_SETTINGS config tables lives here,
// kept separate from the Server Actions in app/[adminSecret]/actions.ts so
// it can be unit tested directly against a real database without going
// through Next's form/action machinery. Every relevant engine
// (apps/worker/src/*-engine.ts, wired up in apps/worker/src/match-tracker.ts)
// already reads these tables fresh on every poll rather than caching them,
// so a write here takes effect on the very next poll with no redeploy.

function parseWholeNumber(formData: FormData, field: string): number {
  const raw = formData.get(field);
  const value = typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative whole number`);
  }
  return value;
}

function parseText(formData: FormData, field: string): string {
  const raw = formData.get(field);
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error(`${field} is required`);
  }
  return raw.trim();
}

const NOTIFICATION_PRIORITIES: NotificationPriority[] = ["low", "normal", "high"];

function parseNotificationPriority(formData: FormData, field: string): NotificationPriority {
  const raw = formData.get(field);
  if (typeof raw !== "string" || !NOTIFICATION_PRIORITIES.includes(raw as NotificationPriority)) {
    throw new Error(`${field} must be one of: ${NOTIFICATION_PRIORITIES.join(", ")}`);
  }
  return raw as NotificationPriority;
}

// XP rewards - see CONTEXT.md's XpTransaction entry and schema.ts's
// xpRewards doc comment. "challenge_completed" never has a row here (its
// amount comes from the completed ChallengeDefinition instead), so the list
// this returns is whatever XpReasons are actually seeded, not the full
// XpReason union.
export interface XpRewardRow {
  reason: XpReason;
  amount: number;
}

export async function listXpRewards(db: Database): Promise<XpRewardRow[]> {
  return db.select().from(xpRewards).orderBy(xpRewards.reason);
}

export async function updateXpRewardFromForm(db: Database, reason: XpReason, formData: FormData): Promise<void> {
  const amount = parseWholeNumber(formData, "amount");
  const [row] = await db.update(xpRewards).set({ amount }).where(eq(xpRewards.reason, reason)).returning();
  if (!row) {
    throw new Error(`Unknown XP reward reason: ${reason}`);
  }
}

// Level curve - see schema.ts's levelThresholds doc comment and
// packages/db/src/level.ts.
export interface LevelThresholdRow {
  level: number;
  xpRequired: number;
}

export async function listLevelThresholds(db: Database): Promise<LevelThresholdRow[]> {
  return db.select().from(levelThresholds).orderBy(levelThresholds.level);
}

export async function updateLevelThresholdFromForm(db: Database, level: number, formData: FormData): Promise<void> {
  const xpRequired = parseWholeNumber(formData, "xpRequired");
  const [row] = await db
    .update(levelThresholds)
    .set({ xpRequired })
    .where(eq(levelThresholds.level, level))
    .returning();
  if (!row) {
    throw new Error(`Unknown level: ${level}`);
  }
}

// Challenge definitions - see schema.ts's challengeDefinitions doc comment.
// `type`/`scope` are structural (they select which GameEvents the Challenge
// Engine reacts to - see challenge-engine.ts) and aren't editable here; only
// the tunable knobs (`target`, `xpReward`) are.
export interface ChallengeDefinitionRow {
  id: number;
  type: ChallengeType;
  scope: ChallengeScope;
  target: number;
  xpReward: number;
}

export async function listChallengeDefinitions(db: Database): Promise<ChallengeDefinitionRow[]> {
  return db.select().from(challengeDefinitions).orderBy(challengeDefinitions.type);
}

export async function updateChallengeDefinitionFromForm(db: Database, id: number, formData: FormData): Promise<void> {
  const target = parseWholeNumber(formData, "target");
  const xpReward = parseWholeNumber(formData, "xpReward");
  const [row] = await db
    .update(challengeDefinitions)
    .set({ target, xpReward })
    .where(eq(challengeDefinitions.id, id))
    .returning();
  if (!row) {
    throw new Error(`Unknown challenge definition: ${id}`);
  }
}

// Achievement definitions - see schema.ts's achievementDefinitions doc
// comment. `trigger` is structural (selects which observed counter the
// Achievement Engine compares `threshold` against - see achievement.ts's
// AchievementTrigger doc comment) and isn't editable here.
export interface AchievementDefinitionRow {
  id: string;
  name: string;
  description: string;
  trigger: AchievementTrigger;
  threshold: number;
}

export async function listAchievementDefinitions(db: Database): Promise<AchievementDefinitionRow[]> {
  return db.select().from(achievementDefinitions).orderBy(achievementDefinitions.id);
}

export async function updateAchievementDefinitionFromForm(
  db: Database,
  id: string,
  formData: FormData,
): Promise<void> {
  const name = parseText(formData, "name");
  const description = parseText(formData, "description");
  const threshold = parseWholeNumber(formData, "threshold");
  const [row] = await db
    .update(achievementDefinitions)
    .set({ name, description, threshold })
    .where(eq(achievementDefinitions.id, id))
    .returning();
  if (!row) {
    throw new Error(`Unknown achievement definition: ${id}`);
  }
}

// Notification rules - see schema.ts's notificationRules doc comment.
export interface NotificationRuleRow {
  kind: NotificationKind;
  priority: NotificationPriority;
  template: string;
}

export async function listNotificationRules(db: Database): Promise<NotificationRuleRow[]> {
  return db.select().from(notificationRules).orderBy(notificationRules.kind);
}

export async function updateNotificationRuleFromForm(
  db: Database,
  kind: NotificationKind,
  formData: FormData,
): Promise<void> {
  const priority = parseNotificationPriority(formData, "priority");
  const template = parseText(formData, "template");
  const [row] = await db
    .update(notificationRules)
    .set({ priority, template })
    .where(eq(notificationRules.kind, kind))
    .returning();
  if (!row) {
    throw new Error(`Unknown notification kind: ${kind}`);
  }
}

// Notification settings - the singleton (id 1) max-per-minute cap on
// low/normal-priority Notifications. See schema.ts's notificationSettings
// doc comment.
export interface NotificationSettingsRow {
  maxLowNormalPerMinute: number;
}

export async function getNotificationSettings(db: Database): Promise<NotificationSettingsRow> {
  const [row] = await db.select().from(notificationSettings).where(eq(notificationSettings.id, 1));
  if (!row) {
    throw new Error("Notification settings row is missing");
  }
  return row;
}

export async function updateNotificationSettingsFromForm(db: Database, formData: FormData): Promise<void> {
  const maxLowNormalPerMinute = parseWholeNumber(formData, "maxLowNormalPerMinute");
  const [row] = await db
    .update(notificationSettings)
    .set({ maxLowNormalPerMinute })
    .where(eq(notificationSettings.id, 1))
    .returning();
  if (!row) {
    throw new Error("Notification settings row is missing");
  }
}

// Banned players - see schema.ts's bannedPlayers doc comment. Unlike every
// other table on this page, this isn't a per-row edit form: it's an
// add/remove list, since a ban has no tunable "value" beyond its own
// existence (plus an optional reason).
export interface BannedPlayerRow {
  steamId: string;
  reason: string | null;
  bannedAt: Date;
}

export async function listBannedPlayers(db: Database): Promise<BannedPlayerRow[]> {
  return db.select().from(bannedPlayers).orderBy(desc(bannedPlayers.bannedAt));
}

export async function banPlayerFromForm(db: Database, formData: FormData): Promise<void> {
  const steamId = parseText(formData, "steamId");
  const rawReason = formData.get("reason");
  const reason = typeof rawReason === "string" && rawReason.trim() !== "" ? rawReason.trim() : null;
  await db
    .insert(bannedPlayers)
    .values({ steamId, reason })
    .onConflictDoUpdate({ target: bannedPlayers.steamId, set: { reason } });
}

export async function unbanPlayerFromForm(db: Database, steamId: string): Promise<void> {
  await db.delete(bannedPlayers).where(eq(bannedPlayers.steamId, steamId));
}
