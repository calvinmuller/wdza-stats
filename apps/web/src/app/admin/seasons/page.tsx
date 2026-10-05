import { listSeasons, SEASON_NAME_MAX_LENGTH, withdrawableSeason } from "@wdza-stats/db";
import { ActionForm } from "@/components/action-form";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format-date";
import { requireStaffPage } from "@/lib/require-staff";
import { AdminShell, dangerButtonClass, rowClass } from "../admin-shell";
import { startSeasonAction, withdrawSeasonAction } from "./actions";
import { StartSeasonForm } from "./start-season-form";

export const dynamic = "force-dynamic";

export default async function SeasonsPage() {
  // Admin-only: starting a Season switches every public leaderboard.
  const staff = await requireStaffPage("admin");
  // Newest first, and Season 1 always exists, so the first is the current one.
  const [seasons, withdrawable] = await Promise.all([listSeasons(db), withdrawableSeason(db)]);
  const current = seasons[0];

  return (
    <AdminShell
      staff={staff}
      title="Seasons"
      description="Seasons are shared by every Server and run back to back: starting the next one ends the current one. Matches already in progress finish in the Season they started in. Career totals, levels and Achievements carry on across Seasons."
    >
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-zinc-100">Current Season</h2>
        <p className="text-sm text-zinc-300">
          Season {current.number}
          {current.name && <span className="text-zinc-400"> - {current.name}</span>}
          <span className="text-zinc-500">, started {formatDateTime(current.startedAt.toISOString())}</span>
        </p>
      </section>

      {withdrawable && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl text-zinc-100">Withdraw Season {withdrawable.number}</h2>
          <p className="max-w-2xl text-xs text-zinc-500">
            Started by mistake? Until one of its Matches closes, Season {withdrawable.number} can be withdrawn:
            Season {withdrawable.number - 1} becomes current again, and Matches in progress, with the XP and
            kill streaks they have earned so far, count towards Season {withdrawable.number - 1}.
          </p>
          <ActionForm
            action={withdrawSeasonAction}
            className={rowClass}
            successMessage="The Season has been withdrawn."
            confirm={`Withdraw Season ${withdrawable.number}${withdrawable.name ? ` (${withdrawable.name})` : ""}? Season ${withdrawable.number - 1} becomes current again, and every leaderboard will switch back to it.`}
          >
            <input type="hidden" name="number" value={withdrawable.number} />
            <button type="submit" className={dangerButtonClass}>
              Withdraw Season {withdrawable.number}
            </button>
          </ActionForm>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-zinc-100">Start Season {current.number + 1}</h2>
        <StartSeasonForm action={startSeasonAction} number={current.number + 1} nameMaxLength={SEASON_NAME_MAX_LENGTH} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-zinc-100">All Seasons</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr>
              <th className="py-2 pr-4 font-medium">Season</th>
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 font-medium">Started</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {seasons.map((season) => (
              <tr key={season.id} className="text-zinc-300">
                <td className="py-2 pr-4">
                  Season {season.number}
                  {season.id === current.id && <span className="ml-2 text-xs text-brand-gold-500">current</span>}
                </td>
                <td className="py-2 pr-4 text-zinc-400">{season.name ?? "-"}</td>
                <td className="py-2 text-zinc-500">{formatDateTime(season.startedAt.toISOString())}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
