"use server";

import { revalidatePath } from "next/cache";
import type { ActionFormState } from "@/components/action-form";
import { db } from "@/lib/db";
import { castBallot, startKickVote } from "@/lib/kick-vote";
import { getVisitorSessionId } from "@/lib/visitor-session";

// Any site visitor may call this - see CONTEXT.md's KickVote entry. No Staff
// gate here, unlike app/admin/actions.ts: the crowd threshold and per-session
// cooldown (both enforced inside startKickVote) are this feature's only
// safeguards, per docs/adr/0006.

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function startKickVoteAction(_previous: ActionFormState, formData: FormData): Promise<ActionFormState> {
  const serverId = Number(text(formData, "serverId"));
  if (!Number.isInteger(serverId)) {
    return { ok: false, error: "Unknown Server." };
  }

  const sessionId = await getVisitorSessionId();
  const result = await startKickVote(db, {
    serverId,
    targetSteamId: text(formData, "targetSteamId"),
    reason: text(formData, "reason"),
    initiatorSessionId: sessionId,
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
