"use client";

import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import type { OnlinePlayer } from "@/lib/kick-vote";
import type { LiveKickVoteView } from "@/lib/live-snapshot";
import { startKickVoteAction } from "./kick-vote-actions";

const inputClass =
  "rounded-lg border border-white/10 bg-zinc-900/60 px-2 py-1.5 text-sm text-zinc-100 focus:border-brand-gold-500 focus:outline-none";
const labelClass = "flex flex-1 flex-col gap-1 text-xs text-zinc-500";
const buttonClass =
  "shrink-0 rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-red-600";

export function KickVotePanel({
  serverId,
  onlinePlayers,
  activeKickVote,
  viewerSteamId,
  staffSteamIds,
}: {
  serverId: number;
  onlinePlayers: OnlinePlayer[];
  activeKickVote: LiveKickVoteView | null;
  /** The signed-in Verified Player, or null - see docs/adr/0007. */
  viewerSteamId: string | null;
  /** Staff Members' linked steamIds, which can never be a target. */
  staffSteamIds: string[];
}) {
  if (activeKickVote) {
    return (
      <section className="rounded-lg border border-red-500/30 bg-red-950/20 px-4 py-3">
        <p className="text-sm text-zinc-200">
          A KickVote is active against{" "}
          <span className="font-medium text-zinc-50">{activeKickVote.targetName}</span> - {activeKickVote.reason}
        </p>
        <Link
          href={`/kick/${activeKickVote.id}`}
          className="mt-1 inline-block text-sm text-brand-gold-400 underline decoration-dotted hover:text-brand-gold-300"
        >
          Cast your Ballot &rarr;
        </Link>
      </section>
    );
  }

  if (onlinePlayers.length === 0) {
    return null;
  }

  // Only a hint: startKickVoteAction re-checks all of this on the server.
  if (!viewerSteamId || !onlinePlayers.some((player) => player.steamId === viewerSteamId)) {
    return (
      <section className="rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-400">
        {viewerSteamId ? (
          "You need to be playing on this Server to start a KickVote."
        ) : (
          <>
            <a
              href={`/api/steam/sign-in?${new URLSearchParams({ returnTo: "/" })}`}
              className="text-brand-gold-400 underline decoration-dotted hover:text-brand-gold-300"
            >
              Sign in with Steam
            </a>{" "}
            to start a KickVote.
          </>
        )}
      </section>
    );
  }

  const targets = onlinePlayers.filter(
    (player) => player.steamId !== viewerSteamId && !staffSteamIds.includes(player.steamId),
  );

  return (
    <section className="rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-3">
      <h2 className="mb-2 text-sm font-medium text-zinc-200">Start a KickVote</h2>
      <ActionForm
        action={startKickVoteAction}
        className="flex flex-wrap items-end gap-3"
        successMessage="KickVote started."
      >
        <input type="hidden" name="serverId" value={serverId} />
        <label className={labelClass}>
          Target
          <select name="targetSteamId" required className={inputClass}>
            {targets.map((player) => (
              <option key={player.steamId} value={player.steamId}>
                {player.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass} style={{ flexBasis: "16rem" }}>
          Reason
          <input name="reason" required autoComplete="off" className={inputClass} />
        </label>
        <button type="submit" className={buttonClass}>
          Start KickVote
        </button>
      </ActionForm>
    </section>
  );
}
