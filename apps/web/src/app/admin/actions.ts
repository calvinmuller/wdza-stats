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
import { getServerByBaseUrl } from "@/lib/server-lookup";

// Server Actions have their own POST endpoint, reachable independent of
// whether the caller ever rendered the gated page (see the Next.js Server
// Actions security guide) - render-time gating on page.tsx alone is not
// enough, so every action here re-checks the signed-in Staff Member's Role
// itself before touching the database. Everything is admin-only for now; the
// moderator-level actions are opened up in ticket 06.

export async function updateXpRewardAction(reason: XpReason, formData: FormData): Promise<void> {
  await requireStaffAction("admin");
  await updateXpRewardFromForm(db, reason, formData);
  redirect("/admin");
}

export async function updateLevelThresholdAction(level: number, formData: FormData): Promise<void> {
  await requireStaffAction("admin");
  await updateLevelThresholdFromForm(db, level, formData);
  redirect("/admin");
}

export async function updateChallengeDefinitionAction(id: number,
  formData: FormData,
): Promise<void> {
  await requireStaffAction("admin");
  await updateChallengeDefinitionFromForm(db, id, formData);
  redirect("/admin");
}

export async function updateAchievementDefinitionAction(id: string,
  formData: FormData,
): Promise<void> {
  await requireStaffAction("admin");
  await updateAchievementDefinitionFromForm(db, id, formData);
  redirect("/admin");
}

export async function updateNotificationRuleAction(kind: NotificationKind,
  formData: FormData,
): Promise<void> {
  await requireStaffAction("admin");
  await updateNotificationRuleFromForm(db, kind, formData);
  redirect("/admin");
}

export async function updateNotificationSettingsAction(formData: FormData): Promise<void> {
  await requireStaffAction("admin");
  await updateNotificationSettingsFromForm(db, formData);
  redirect("/admin");
}

export async function banPlayerAction(formData: FormData): Promise<void> {
  await requireStaffAction("admin");
  await banPlayerFromForm(db, formData);
  redirect("/admin");
}

export async function unbanPlayerAction(steamId: string): Promise<void> {
  await requireStaffAction("admin");
  await unbanPlayerFromForm(db, steamId);
  redirect("/admin");
}

// What the feed token form shows after a click: the new token (the only time
// it is ever visible) or why there isn't one.
export type FeedTokenState = { token: string | null; error: string | null };

export async function generateFeedTokenAction(_previous: FeedTokenState,
  _formData: FormData,
): Promise<FeedTokenState> {
  await requireStaffAction("admin");
  const server = await getServerByBaseUrl(db, CONFIGURED_SERVER_BASE_URL);
  if (!server) {
    return { token: null, error: "No Server is registered yet - the Worker creates it on its first poll." };
  }
  const token = await generateFeedToken(db, server.id);
  return token ? { token, error: null } : { token: null, error: "The Server could not be found." };
}
