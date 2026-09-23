import Link from "next/link";
import { getKickVoteSettings } from "@/lib/admin-config";
import { db } from "@/lib/db";
import { listActiveKickVotes } from "@/lib/kick-vote";
import { hasRole, requireStaffPage } from "@/lib/require-staff";
import { cancelKickVoteAction, updateKickVoteSettingsAction } from "../actions";
import { AdminShell, buttonClass, dangerButtonClass, inputClass, labelClass, rowClass } from "../admin-shell";

export const dynamic = "force-dynamic";

function formatRemaining(endsAt: Date): string {
  const totalSeconds = Math.max(0, Math.floor((endsAt.getTime() - Date.now()) / 1000));
  return `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60).toString().padStart(2, "0")} left`;
}

const SETTINGS_FIELDS = [
  { name: "thresholdBallots", label: "Ballots to kick", min: 1 },
  { name: "durationSeconds", label: "Duration (seconds)", min: 0 },
  { name: "initiatorCooldownSeconds", label: "Initiator cooldown (seconds)", min: 0 },
] as const;

// Moderators can cancel KickVotes and see the settings; only admins can edit
// the settings (actions.ts re-checks both on submit).
export default async function Page({ searchParams }: { searchParams: Promise<{ alreadyEnded?: string }> }) {
  const { alreadyEnded } = await searchParams;
  const staff = await requireStaffPage("moderator");
  const canEditSettings = hasRole(staff, "admin");
  const [activeKickVotes, settings] = await Promise.all([listActiveKickVotes(db), getKickVoteSettings(db)]);

  return (
    <AdminShell staff={staff} title="Kick Votes" description="Cancel an active kick vote, and tune how kick votes run.">
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-zinc-100">Active kick votes</h2>
        {alreadyEnded && (
          <p role="status" className="text-sm text-brand-gold-500">
            Kick vote #{alreadyEnded} had already ended, so it was not cancelled.
          </p>
        )}
        <div className="flex flex-col gap-2">
          {activeKickVotes.length === 0 ? (
            <p className="text-sm text-zinc-500">No kick votes are active.</p>
          ) : (
            activeKickVotes.map((vote) => (
              <div key={vote.id} className={rowClass}>
                <Link href={`/kick/${vote.id}`} className="min-w-40 font-medium text-zinc-200 hover:text-zinc-50">
                  {vote.targetName}
                  <span className="block text-xs font-normal text-zinc-500">{vote.targetSteamId}</span>
                </Link>
                <span className="text-sm text-zinc-400">{vote.serverName}</span>
                <span className="flex-1 text-sm text-zinc-400">{vote.reason}</span>
                <span className="text-xs text-zinc-500">
                  {vote.ballotCount} / {vote.threshold} Ballots · {formatRemaining(vote.endsAt)}
                </span>
                <form action={cancelKickVoteAction.bind(null, vote.id)}>
                  <button type="submit" className={dangerButtonClass}>
                    Cancel
                  </button>
                </form>
              </div>
            ))
          )}
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-zinc-100">Settings</h2>
        <p className="max-w-2xl text-xs text-zinc-500">
          Each kick vote keeps the threshold and duration it started with, so a change here only affects
          kick votes started afterwards.
        </p>
        <form action={updateKickVoteSettingsAction} className={rowClass}>
          {SETTINGS_FIELDS.map((field) => (
            <label key={field.name} className={labelClass}>
              {field.label}
              <input
                type="number"
                name={field.name}
                min={field.min}
                step={1}
                defaultValue={settings[field.name]}
                disabled={!canEditSettings}
                className={inputClass}
              />
            </label>
          ))}
          {canEditSettings && (
            <button type="submit" className={buttonClass}>
              Save
            </button>
          )}
        </form>
      </section>
    </AdminShell>
  );
}
