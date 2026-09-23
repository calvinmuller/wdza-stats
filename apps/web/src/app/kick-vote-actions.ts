"use server";

import { revalidatePath } from "next/cache";
import type { ActionFormState } from "@/components/action-form";
import { db } from "@/lib/db";
import { getCurrentVerifiedPlayerSteamId } from "@/lib/current-verified-player";
import { castBallot, startKickVote } from "@/lib/kick-vote";
import { getVisitorSessionId } from "@/lib/visitor-session";

// No Staff gate here, unlike app/admin/actions.ts - see CONTEXT.md's KickVote
// entry. Starting a KickVote needs a Verified Player signed in with Steam
// (docs/adr/0007), whose steamId comes from their sign-in, never the form.
// Casting a Ballot needs nothing: it stays one per anonymous browser session,
// with the crowd threshold as its safeguard (docs/adr/0006).

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function startKickVoteAction(_previous: ActionFormState, formData: FormData): Promise<ActionFormState> {
  const serverId = Number(text(formData, "serverId"));
  if (!Number.isInteger(serverId)) {
    return { ok: false, error: "Unknown Server." };
  }

  const initiatorSteamId = await getCurrentVerifiedPlayerSteamId();
  if (!initiatorSteamId) {
    return { ok: false, error: "Sign in with Steam to start a KickVote." };
  }

  const result = await startKickVote(db, {
    serverId,
    targetSteamId: text(formData, "targetSteamId"),
    reason: text(formData, "reason"),
    initiatorSteamId,
  });

  if (!result.ok) return result;
  revalidatePath("/");
  return { ok: true };
}

export async function castBallotAction(_previous: ActionFormState, formData: FormData): Promise<ActionFormState> {
  const kickVoteId = Number(text(formData, "kickVoteId"));
  if (!Number.isInteger(kickVoteId)) {
    return { ok: false, error: "Unknown KickVote." };
  }

  const sessionId = await getVisitorSessionId();
  const result = await castBallot(db, { kickVoteId, sessionId });

  if (!result.ok) return result;
  revalidatePath(`/kick/${kickVoteId}`);
  return { ok: true };
}
