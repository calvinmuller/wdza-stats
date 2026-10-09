"use server";

import { revalidatePath } from "next/cache";
import type { ActionFormState } from "@/components/action-form";
import { db } from "@/lib/db";
import { generateFeedToken } from "@/lib/feed-token";
import { requireStaffAction } from "@/lib/require-staff";
import { addServer, updateServer, type ServerInput } from "@/lib/server-management";
import { recordStaffAction } from "@/lib/staff-audit";

// Adding and editing Servers changes what the Worker polls and what the public
// site shows, so everything here is admin-only, and each action re-checks that
// itself (a Server Action is its own POST endpoint). An RCON or kill feed
// token is never put in the audit record, only whether one was set.

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function serverInput(formData: FormData): ServerInput {
  return {
    name: text(formData, "name"),
    slug: text(formData, "slug"),
    baseUrl: text(formData, "baseUrl"),
    rconToken: text(formData, "rconToken"),
    enabled: formData.get("enabled") === "on",
  };
}

export async function addServerAction(_previous: ActionFormState, formData: FormData): Promise<ActionFormState> {
  const staff = await requireStaffAction("admin");
  const input = serverInput(formData);
  const result = await addServer(db, input);
  if (!result.ok) return result;
  await recordStaffAction(db, staff, "add_server", {
    target: String(result.serverId),
    detail: { name: input.name.trim(), slug: input.slug.trim(), baseUrl: input.baseUrl.trim(), enabled: input.enabled },
  });
  revalidatePath("/admin/servers");
  return { ok: true };
}

export async function updateServerAction(
  serverId: number,
  _previous: ActionFormState,
  formData: FormData,
): Promise<ActionFormState> {
  const staff = await requireStaffAction("admin");
  const input = serverInput(formData);
  const result = await updateServer(db, serverId, input);
  if (!result.ok) return result;
  await recordStaffAction(db, staff, "update_server", {
    target: String(serverId),
    detail: {
      name: input.name.trim(),
      slug: input.slug.trim(),
      baseUrl: input.baseUrl.trim(),
      enabled: input.enabled,
      rconTokenReplaced: input.rconToken.trim() !== "",
    },
  });
  revalidatePath("/admin/servers");
  return { ok: true };
}

// What the feed token form shows after a click: the new token (the only time
// it is ever visible) or why there isn't one.
export type FeedTokenState = { token: string | null; error: string | null };

export async function generateFeedTokenAction(
  serverId: number,
  _previous: FeedTokenState,
  _formData: FormData,
): Promise<FeedTokenState> {
  const staff = await requireStaffAction("admin");
  const token = await generateFeedToken(db, serverId);
  if (!token) return { token: null, error: "That Server no longer exists." };
  // The token itself is never recorded, only that a new one was issued.
  await recordStaffAction(db, staff, "generate_feed_token", { target: String(serverId) });
  return { token, error: null };
}
