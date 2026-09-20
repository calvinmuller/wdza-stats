"use server";

import type { NotificationKind, XpReason } from "@wdza-stats/db";
import { redirect } from "next/navigation";
import {
  banPlayerFromForm,
  unbanPlayerFromForm,
  updateAchievementDefinitionFromForm,
  updateChallengeDefinitionFromForm,
  updateLevelThresholdFromForm,
  updateNotificationRuleFromForm,
  updateNotificationSettingsFromForm,
  updateXpRewardFromForm,
} from "@/lib/admin-config";
import { generateFeedToken } from "@/lib/feed-token";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { db } from "@/lib/db";
import { requireStaffAction } from "@/lib/require-staff";
import { formFields, recordStaffAction } from "@/lib/staff-audit";
import { getServerByBaseUrl } from "@/lib/server-lookup";

// Server Actions have their own POST endpoint, reachable independent of
// whether the caller ever rendered the gated page (see the Next.js Server
// Actions security guide) - render-time gating on page.tsx alone is not
// enough, so every action here re-checks the signed-in Staff Member's Role
// itself before touching the database. Ban and unban are moderator-level (and
// so open to admins too); everything else here changes how the game behaves and
// is admin-only. Each one records who did it (lib/staff-audit.ts) once it has
// worked, and never puts a password or token in the record.

export async function updateXpRewardAction(reason: XpReason, formData: FormData): Promise<void> {
  const staff = await requireStaffAction("admin");
  await updateXpRewardFromForm(db, reason, formData);
  await recordStaffAction(db, staff, "update_xp_reward", { target: reason, detail: formFields(formData) });
  redirect("/admin");
}

export async function updateLevelThresholdAction(level: number, formData: FormData): Promise<void> {
  const staff = await requireStaffAction("admin");
  await updateLevelThresholdFromForm(db, level, formData);
  await recordStaffAction(db, staff, "update_level_threshold", { target: String(level), detail: formFields(formData) });
  redirect("/admin");
}

export async function updateChallengeDefinitionAction(id: number, formData: FormData): Promise<void> {
  const staff = await requireStaffAction("admin");
  await updateChallengeDefinitionFromForm(db, id, formData);
  await recordStaffAction(db, staff, "update_challenge_definition", { target: String(id), detail: formFields(formData) });
  redirect("/admin");
}

export async function updateAchievementDefinitionAction(id: string, formData: FormData): Promise<void> {
  const staff = await requireStaffAction("admin");
  await updateAchievementDefinitionFromForm(db, id, formData);
  await recordStaffAction(db, staff, "update_achievement_definition", { target: id, detail: formFields(formData) });
  redirect("/admin");
}

export async function updateNotificationRuleAction(kind: NotificationKind, formData: FormData): Promise<void> {
  const staff = await requireStaffAction("admin");
  await updateNotificationRuleFromForm(db, kind, formData);
  await recordStaffAction(db, staff, "update_notification_rule", { target: kind, detail: formFields(formData) });
  redirect("/admin");
}

export async function updateNotificationSettingsAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAction("admin");
  await updateNotificationSettingsFromForm(db, formData);
  await recordStaffAction(db, staff, "update_notification_settings", { detail: formFields(formData) });
  redirect("/admin");
}

export async function banPlayerAction(formData: FormData): Promise<void> {
  const staff = await requireStaffAction("moderator");
  await banPlayerFromForm(db, formData);
  const fields = formFields(formData);
  await recordStaffAction(db, staff, "ban_player", {
    target: fields.steamId?.trim(),
    detail: { reason: fields.reason?.trim() || null },
  });
  redirect("/admin");
}

export async function unbanPlayerAction(steamId: string): Promise<void> {
  const staff = await requireStaffAction("moderator");
  await unbanPlayerFromForm(db, steamId);
  await recordStaffAction(db, staff, "unban_player", { target: steamId });
  redirect("/admin");
}

// What the feed token form shows after a click: the new token (the only time
// it is ever visible) or why there isn't one.
export type FeedTokenState = { token: string | null; error: string | null };

export async function generateFeedTokenAction(
  _previous: FeedTokenState,
  _formData: FormData,
): Promise<FeedTokenState> {
  const staff = await requireStaffAction("admin");
  const server = await getServerByBaseUrl(db, CONFIGURED_SERVER_BASE_URL);
  if (!server) {
    return { token: null, error: "No Server is registered yet - the Worker creates it on its first poll." };
  }
  const token = await generateFeedToken(db, server.id);
  if (!token) return { token: null, error: "The Server could not be found." };
  // The token itself is never recorded, only that a new one was issued.
  await recordStaffAction(db, staff, "generate_feed_token", { target: String(server.id) });
  return { token, error: null };
}
