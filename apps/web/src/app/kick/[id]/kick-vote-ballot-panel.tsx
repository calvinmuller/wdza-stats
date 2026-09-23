"use client";

import { useEffect, useState } from "react";
import type { KickVoteStatus } from "@wdza-stats/db";
import { ActionForm } from "@/components/action-form";
import { castBallotAction } from "@/app/kick-vote-actions";

const STATUS_LABEL: Record<KickVoteStatus, string> = {
  active: "Voting is open.",
  succeeded: "The vote succeeded - the target was kicked.",
  expired: "The vote expired without reaching its threshold.",
  targetLeft: "The target left the Server before the vote could resolve.",
  staffCancelled: "A Staff Member cancelled this vote.",
};

interface StreamUpdate {
  status: KickVoteStatus;
  ballotCount: number;
  threshold: number;
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function KickVoteBallotPanel({
  kickVoteId,
  targetName,
  reason,
  initialStatus,
  threshold,
  endsAt,
  initialBallotCount,
  initialHasVoted,
}: {
  kickVoteId: number;
  targetName: string;
  reason: string;
  initialStatus: KickVoteStatus;
  threshold: number;
  endsAt: string;
  initialBallotCount: number;
  initialHasVoted: boolean;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [ballotCount, setBallotCount] = useState(initialBallotCount);
  const [hasVoted, setHasVoted] = useState(initialHasVoted);
  const [remainingMs, setRemainingMs] = useState(() => new Date(endsAt).getTime() - Date.now());

  // Live Ballot count/status for every open tab watching this KickVote - no
  // polling, per ticket 02.
  useEffect(() => {
    const source = new EventSource(`/api/kick/${kickVoteId}/stream`);
    const onUpdate = (event: MessageEvent<string>) => {
      const data = JSON.parse(event.data) as StreamUpdate;
      setStatus(data.status);
      setBallotCount(data.ballotCount);
    };
    source.addEventListener("update", onUpdate);
    return () => source.close();
  }, [kickVoteId]);

  useEffect(() => {
    if (status !== "active") return;
    const interval = setInterval(() => setRemainingMs(new Date(endsAt).getTime() - Date.now()), 1000);
    return () => clearInterval(interval);
  }, [endsAt, status]);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 rounded-xl border border-white/10 bg-zinc-900/60 p-6">
      <h1 className="text-2xl">KickVote against {targetName}</h1>
      <p className="text-zinc-400">{reason}</p>
      <p className="text-sm text-zinc-400">{STATUS_LABEL[status]}</p>

      <div>
        <p className="text-sm text-zinc-400">
          {ballotCount} / {threshold} Ballots
        </p>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-red-600 transition-[width]"
            style={{ width: `${Math.min(100, (ballotCount / threshold) * 100)}%` }}
          />
        </div>
      </div>

      {status === "active" && (
        <>
          <p className="text-sm text-zinc-400">Time remaining: {formatRemaining(remainingMs)}</p>
          {hasVoted ? (
            <p className="text-sm text-brand-green-500">You&apos;ve cast your Ballot.</p>
          ) : (
            <ActionForm
              action={castBallotAction}
              className="flex flex-col gap-2"
              onSuccess={() => setHasVoted(true)}
            >
              <input type="hidden" name="kickVoteId" value={kickVoteId} />
              <button
                type="submit"
                className="self-start rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-zinc-50 transition-colors hover:bg-red-600"
              >
                Cast your Ballot
              </button>
            </ActionForm>
          )}
        </>
      )}
    </div>
  );
}
