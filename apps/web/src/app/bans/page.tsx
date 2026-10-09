import { PublicListPlayerCell } from "@/components/public-list-player";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format-date";
import { listPublicBans } from "@/lib/public-lists";

// A DB read via drizzle isn't a Request-time API, so Next won't otherwise
// know this route needs fresh data on every request - force it dynamic so a
// ban shows up as soon as it's made or synced from Warcon.
export const dynamic = "force-dynamic";

// Every BannedPlayer, on every Server: bans made in the admin area and the
// ones the Worker copies from WDZA's Warcon ban list alike (docs/adr/0010).
export default async function BansPage() {
  const bans = await listPublicBans(db);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl">Bans</h1>
        <p className="max-w-2xl text-sm text-zinc-400">
          Players banned from every WDZA server. A banned player is left out of the leaderboards,
          rankings and stats.
        </p>
      </div>

      {bans.length === 0 ? (
        <p className="text-sm text-zinc-500">Nobody is banned.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3 text-left font-medium">Player</th>
                <th className="px-4 py-3 text-left font-medium">Reason</th>
                <th className="px-4 py-3 text-left font-medium">Banned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {bans.map((ban) => (
                <tr key={ban.steamId} className="hover:bg-white/5">
                  <td className="px-4 py-2.5">
                    <PublicListPlayerCell player={ban} />
                  </td>
                  <td className="px-4 py-2.5 text-zinc-300">{ban.reason ?? "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-zinc-500">
                    {formatDate(ban.bannedAt.toISOString())}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
