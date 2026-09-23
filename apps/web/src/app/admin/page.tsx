import { listBannedPlayers } from "@/lib/admin-config";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format-date";
import { requireStaffPage } from "@/lib/require-staff";
import { banPlayerAction, unbanPlayerAction } from "./actions";
import { AdminShell, buttonClass, dangerButtonClass, labelClass, rowClass, textInputClass } from "./admin-shell";

// A DB read via drizzle isn't a Request-time API, so Next won't otherwise
// know this route needs fresh data on every request - force it dynamic so
// edits are visible immediately on the next load, matching every other page.
export const dynamic = "force-dynamic";

// Moderators can reach only this section and Kick Votes; every other admin
// page is admin-only.
// Render-time gating alone isn't a security boundary (see actions.ts's own
// re-check), but it keeps this area unreachable, and unadvertised, for anyone
// who isn't signed-in staff: they get the same 404 as any unknown URL.
export default async function AdminPage() {
  const staff = await requireStaffPage("moderator");
  const bannedPlayerRows = await listBannedPlayers(db);

  return (
    <AdminShell staff={staff} title="Players" description="Ban and unban players.">
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl text-zinc-100">Banned players</h2>
          <p className="max-w-2xl text-xs text-zinc-500">
            A banned Steam ID is ignored everywhere: it never shows on the leaderboard, rankings,
            server stats, player search, or the live snapshot, and the Worker stops updating its
            stats on the next poll.
          </p>

          <div className="flex flex-col gap-2">
            {bannedPlayerRows.length === 0 ? (
              <p className="text-sm text-zinc-500">No players are banned.</p>
            ) : (
              bannedPlayerRows.map((banned) => (
                <div key={banned.steamId} className={rowClass}>
                  <span className="min-w-40 font-medium text-zinc-200">{banned.steamId}</span>
                  <span className="flex-1 text-sm text-zinc-400">{banned.reason ?? "—"}</span>
                  <span className="text-xs text-zinc-500">
                    Banned {formatDateTime(banned.bannedAt.toISOString())}
                  </span>
                  <form action={unbanPlayerAction.bind(null, banned.steamId)}>
                    <button type="submit" className={dangerButtonClass}>
                      Unban
                    </button>
                  </form>
                </div>
              ))
            )}
          </div>

          <form action={banPlayerAction} className={rowClass}>
            <label className={`${labelClass} min-w-40 flex-1`}>
              Steam ID
              <input type="text" name="steamId" required className={textInputClass} />
            </label>
            <label className={`${labelClass} min-w-48 flex-[2]`}>
              Reason (optional)
              <input type="text" name="reason" className={textInputClass} />
            </label>
            <button type="submit" className={buttonClass}>
              Ban
            </button>
          </form>
        </section>
    </AdminShell>
  );
}
