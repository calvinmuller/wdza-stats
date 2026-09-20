"use server";

import type { NotificationKind, XpReason } from "@wdza-stats/db";
import { notFound, redirect } from "next/navigation";
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
import { ADMIN_PATH_SECRET } from "@/lib/admin-secret";
import { generateFeedToken } from "@/lib/feed-token";
import { CONFIGURED_SERVER_BASE_URL } from "@/lib/live-server-config";
import { getServerByBaseUrl } from "@/lib/server-lookup";
import { db } from "@/lib/db";

// Server Actions have their own POST endpoint, reachable independent of
// whether the caller ever rendered the gated page (see the Next.js Server
// Actions security guide) - render-time gating on page.tsx alone is not
// enough, so every action here re-checks the secret itself before touching
// the database. `secret` is bound in from the rendering page's own route
// param via Function.prototype.bind (see page.tsx), not read from form
// input, so it can't be tampered with client-side.
function assertSecret(secret: string): void {
  if (secret !== ADMIN_PATH_SECRET) {
    notFound();
  }
}

export async function updateXpRewardAction(secret: string, reason: XpReason, formData: FormData): Promise<void> {
  assertSecret(secret);
  await updateXpRewardFromForm(db, reason, formData);
  redirect(`/${secret}`);
}

export async function updateLevelThresholdAction(secret: string, level: number, formData: FormData): Promise<void> {
  assertSecret(secret);
  await updateLevelThresholdFromForm(db, level, formData);
  redirect(`/${secret}`);
}

export async function updateChallengeDefinitionAction(
  secret: string,
  id: number,
  formData: FormData,
): Promise<void> {
  assertSecret(secret);
  await updateChallengeDefinitionFromForm(db, id, formData);
  redirect(`/${secret}`);
}

export async function updateAchievementDefinitionAction(
  secret: string,
  id: string,
  formData: FormData,
): Promise<void> {
  assertSecret(secret);
  await updateAchievementDefinitionFromForm(db, id, formData);
  redirect(`/${secret}`);
}

export async function updateNotificationRuleAction(
  secret: string,
  kind: NotificationKind,
  formData: FormData,
): Promise<void> {
  assertSecret(secret);
  await updateNotificationRuleFromForm(db, kind, formData);
  redirect(`/${secret}`);
}

export async function updateNotificationSettingsAction(secret: string, formData: FormData): Promise<void> {
  assertSecret(secret);
  await updateNotificationSettingsFromForm(db, formData);
  redirect(`/${secret}`);
}

export async function banPlayerAction(secret: string, formData: FormData): Promise<void> {
  assertSecret(secret);
  await banPlayerFromForm(db, formData);
  redirect(`/${secret}`);
}

export async function unbanPlayerAction(secret: string, steamId: string): Promise<void> {
  assertSecret(secret);
  await unbanPlayerFromForm(db, steamId);
  redirect(`/${secret}`);
}

// What the feed token form shows after a click: the new token (the only time
// it is ever visible) or why there isn't one.
export type FeedTokenState = { token: string | null; error: string | null };

export async function generateFeedTokenAction(
  secret: string,
  _previous: FeedTokenState,
  _formData: FormData,
): Promise<FeedTokenState> {
  assertSecret(secret);
  const server = await getServerByBaseUrl(db, CONFIGURED_SERVER_BASE_URL);
  if (!server) {
    return { token: null, error: "No Server is registered yet - the Worker creates it on its first poll." };
  }
  const token = await generateFeedToken(db, server.id);
  return token ? { token, error: null } : { token: null, error: "The Server could not be found." };
}
