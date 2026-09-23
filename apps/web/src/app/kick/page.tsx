import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getOldestActiveKickVoteId } from "@/lib/kick-vote";

// A short link to say out loud in-game: sends players to the active KickVote
// without anyone relaying its id. Force dynamic so it never redirects to a
// KickVote cached from an earlier request.
export const dynamic = "force-dynamic";

export default async function ActiveKickVoteRedirect(): Promise<never> {
  const kickVoteId = await getOldestActiveKickVoteId(db);
  redirect(kickVoteId === null ? "/" : `/kick/${kickVoteId}`);
}
