import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getBallotCount, getKickVote, hasCastBallot } from "@/lib/kick-vote";
import { getVisitorSessionIdIfPresent } from "@/lib/visitor-session";
import { KickVoteBallotPanel } from "./kick-vote-ballot-panel";

// A DB read via drizzle isn't a Request-time API, so Next won't otherwise
// know this route needs fresh data on every request - force it dynamic so
// visitors always see the current Ballot count and status.
export const dynamic = "force-dynamic";

export default async function KickVotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kickVoteId = Number(id);
  const vote = Number.isInteger(kickVoteId) ? await getKickVote(db, kickVoteId) : null;
  if (!vote) {
    notFound();
  }

  // Read-only: minting a session cookie is a Server Action's job (casting a
  // Ballot), not this page render's.
  const sessionId = await getVisitorSessionIdIfPresent();
  const [ballotCount, hasVoted] = await Promise.all([
    getBallotCount(db, vote.id),
    sessionId ? hasCastBallot(db, vote.id, sessionId) : Promise.resolve(false),
  ]);

  return (
    <KickVoteBallotPanel
      kickVoteId={vote.id}
      targetName={vote.targetName}
      reason={vote.reason}
      initialStatus={vote.status}
      threshold={vote.threshold}
      endsAt={vote.endsAt.toISOString()}
      initialBallotCount={ballotCount}
      initialHasVoted={hasVoted}
    />
  );
}
