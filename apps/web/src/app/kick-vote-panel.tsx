"use client";

import Link from "next/link";
import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { ActionForm } from "@/components/action-form";
import type { KickVoteInitiator } from "@/lib/current-kick-vote-initiator";
import type { OnlinePlayer } from "@/lib/kick-vote";
import type { LiveKickVoteView } from "@/lib/live-snapshot";
import { startKickVoteAction } from "./kick-vote-actions";

const inputClass =
  "rounded-lg border border-white/10 bg-zinc-900/60 px-2 py-1.5 text-sm text-zinc-100 focus:border-brand-gold-500 focus:outline-none";
const labelClass = "flex flex-1 flex-col gap-1 text-xs text-zinc-500";
const buttonClass =
  "shrink-0 rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-red-600";

/** The Server's active KickVote, if any - starting one happens from the Online players table. */
export function KickVotePanel({ activeKickVote }: { activeKickVote: LiveKickVoteView | null }) {
  if (!activeKickVote) return null;

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

/**
 * Whether `viewer` may start a KickVote here - only a hint for which UI to
 * show: startKickVoteAction re-checks all of this on the server. A Staff
 * Member needn't be online (docs/adr/0008).
 */
export function canStartKickVote(viewer: KickVoteInitiator | null, onlinePlayers: OnlinePlayer[]): viewer is KickVoteInitiator {
  return viewer !== null && (viewer.isStaff || onlinePlayers.some((player) => player.steamId === viewer.steamId));
}

/** Why the Online players table has no KickVote actions, for a viewer who can't start one. */
export function KickVoteHint({ viewer }: { viewer: KickVoteInitiator | null }) {
  return (
    <p className="mb-3 text-sm text-zinc-500">
      {viewer ? (
        "Join this Server in-game to start a KickVote against a player."
      ) : (
        <>
          <a
            href={`/api/steam/sign-in?${new URLSearchParams({ returnTo: "/" })}`}
            className="text-brand-gold-400 underline decoration-dotted hover:text-brand-gold-300"
          >
            Sign in with Steam
          </a>{" "}
          to start a KickVote against a player.
        </>
      )}
    </p>
  );
}

/** Disabled while the KickVote is being started, so a slow Server Action can't be submitted twice. */
function StartKickVoteSubmit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${buttonClass} disabled:cursor-wait disabled:opacity-60`}>
      {pending ? "Starting..." : "Start KickVote"}
    </button>
  );
}

/**
 * A row action in the Online players table: asks for a reason, then starts a
 * KickVote against `target`. The dialog stays open until `onStarted` has
 * refreshed the table, so its "Kick vote" buttons are gone when it closes.
 */
export function StartKickVoteButton({
  serverId,
  target,
  onStarted,
}: {
  serverId: number;
  target: OnlinePlayer;
  onStarted: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={`Start a KickVote against ${target.displayName}`}
        className="rounded-md border border-red-500/30 px-2 py-0.5 text-xs text-red-300 transition-colors hover:bg-red-950/40"
      >
        Kick vote
      </button>
      <dialog
        ref={dialogRef}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-white/10 bg-zinc-950 p-4 text-left normal-case text-zinc-100 backdrop:bg-black/60"
      >
        <h2 className="mb-3 text-base font-medium">
          Start a KickVote against <span className="text-zinc-50">{target.displayName}</span>
        </h2>
        <ActionForm
          action={startKickVoteAction}
          className="flex flex-wrap items-end gap-3"
          onSuccess={async () => {
            await onStarted();
            dialogRef.current?.close();
          }}
        >
          <input type="hidden" name="serverId" value={serverId} />
          <input type="hidden" name="targetSteamId" value={target.steamId} />
          <label className={labelClass} style={{ flexBasis: "16rem" }}>
            Reason
            <input name="reason" required autoComplete="off" className={inputClass} />
          </label>
          <div className="flex basis-full justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              Cancel
            </button>
            <StartKickVoteSubmit />
          </div>
        </ActionForm>
      </dialog>
    </>
  );
}
